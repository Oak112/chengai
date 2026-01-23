import { NextRequest } from 'next/server';
import { retrieveContext } from '@/lib/rag';
import { streamChat, CHAT_SYSTEM_PROMPT } from '@/lib/ai';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { extractSkillsFromText } from '@/lib/skills-import';
import {
  getPublishedArticles,
  getPublishedExperiences,
  getPublishedProjects,
  getPublicStories,
  getSkills,
} from '@/lib/content';
import type { Article, ChunkReference, Experience, Project, Skill, Story } from '@/types';

export const runtime = 'nodejs';

const MAX_FALLBACK_SNIPPET_CHARS = 1800;
const MAX_RETRIEVAL_QUERY_CHARS = 2600;

function buildFallbackSnippet(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  if (normalized.length <= MAX_FALLBACK_SNIPPET_CHARS) return normalized;
  return `${normalized.slice(0, MAX_FALLBACK_SNIPPET_CHARS)}…`;
}

function clampText(value: string, maxChars: number): string {
  const v = String(value || '').trim();
  if (v.length <= maxChars) return v;
  return `${v.slice(0, maxChars)}…`;
}

function buildRetrievalQuery(args: {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }> | null;
  sessionContextText?: string;
}): string {
  const history = Array.isArray(args.conversationHistory)
    ? args.conversationHistory
        .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
        .slice(-2)
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n')
    : '';

  const parts: string[] = [];
  parts.push(`Q: ${args.message}`);
  if (history) parts.push(`Recent user context:\n${history}`);
  if (args.sessionContextText) parts.push(`Session context:\n${clampText(args.sessionContextText, 1400)}`);

  const base = parts.join('\n\n').trim();
  const skills = extractSkillsFromText(base).slice(0, 10).map((s) => s.name);
  const expanded = skills.length > 0 ? `${base}\n\nKey skills/keywords: ${skills.join(', ')}` : base;

  return clampText(expanded, MAX_RETRIEVAL_QUERY_CHARS);
}

function buildRetrievalConfig(args: {
  mode?: 'auto' | 'tech' | 'behavior';
  hasSessionContext: boolean;
}): { sourceTypes?: string[]; topK: number } {
  if (args.mode === 'behavior') {
    return { topK: 12, sourceTypes: ['story', 'experience', 'resume'] };
  }

  if (args.mode === 'tech') {
    return { topK: 12, sourceTypes: ['project', 'experience', 'article', 'resume', 'skill'] };
  }

  // Auto mode: keep it broad and let retrieval + the model decide what matters.
  // If the user provided a long session context (JDs, prior reports), retrieve a bit more.
  return { topK: args.hasSessionContext ? 14 : 12, sourceTypes: undefined };
}

function sortSources(sources: ChunkReference[]): ChunkReference[] {
  const typeOrder = ['resume', 'project', 'experience', 'skill', 'article', 'story', 'index'];
  const idx = (t: string) => {
    const i = typeOrder.indexOf(t);
    return i === -1 ? 999 : i;
  };

  const cloned = [...(sources || [])];
  cloned.sort((a, b) => {
    const diff = idx(a.source_type) - idx(b.source_type);
    if (diff !== 0) return diff;
    // Keep ChengAI near the front within projects to improve “what have you built” recall.
    if (a.source_type === 'project' && b.source_type === 'project') {
      const aIsChengai = a.source_slug === 'chengai';
      const bIsChengai = b.source_slug === 'chengai';
      if (aIsChengai !== bIsChengai) return aIsChengai ? -1 : 1;
    }
    return (b.relevance_score || 0) - (a.relevance_score || 0);
  });

  return cloned;
}

function dedupeSourcesForUi(sources: ChunkReference[]): ChunkReference[] {
  const out: ChunkReference[] = [];
  const seen = new Set<string>();

  for (const s of sources || []) {
    const slugOrTitle = s.source_slug || s.source_title || s.source_id || '';
    const key = `${s.source_type || 'unknown'}:${slugOrTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}

function getSourceHref(source: ChunkReference): string | null {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chengai-tianle.ai-builders.space').replace(/\/$/, '');
  const toPublicUrl = (path: string) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const type = source.source_type;
  if (type === 'article' && source.source_slug) return toPublicUrl(`/articles/${source.source_slug}`);
  if (type === 'project' && source.source_slug) return toPublicUrl(`/projects/${source.source_slug}`);
  if (type === 'experience') return toPublicUrl('/experience');
  if (type === 'resume') return toPublicUrl('/api/resume');
  if (type === 'story') return toPublicUrl('/stories');
  if (type === 'skill') return toPublicUrl('/skills');
  return null;
}

function formatContextFromSources(sources: ChunkReference[]): string {
  return (sources || [])
    .map((r, idx) => {
      const slugPart = r.source_slug ? ` (slug: ${r.source_slug})` : '';
      const url = getSourceHref(r);
      const urlLine = url ? `\nURL: ${url}` : '';
      return `SOURCE ${idx + 1}\nType: ${r.source_type}\nTitle: ${r.source_title}${slugPart}${urlLine}\nSnippet: ${r.content_preview}`;
    })
    .join('\n\n');
}

async function buildPortfolioIndexText(): Promise<string> {
  if (!isSupabaseConfigured()) return '';

  const [projects, experiences, skills, articles, stories] = await Promise.all([
    getPublishedProjects(),
    getPublishedExperiences(),
    getSkills(),
    getPublishedArticles(),
    getPublicStories(),
  ]);

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chengai-tianle.ai-builders.space').replace(/\/$/, '');
  const toPublicUrl = (path: string) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const lines: string[] = [];
  lines.push('PORTFOLIO INDEX (navigation only, not proof for metrics)');
  lines.push(`Website: ${toPublicUrl('/')}`);
  lines.push(`Resume: ${toPublicUrl('/api/resume')}`);

  if (projects.length > 0) {
    lines.push('\nProjects:');
    for (const p of projects) {
      const url = p.slug ? toPublicUrl(`/projects/${p.slug}`) : null;
      const parts = [p.title, url ? `URL: ${url}` : null, p.demo_url ? `Demo: ${p.demo_url}` : null, p.repo_url ? `Repo: ${p.repo_url}` : null, p.article_url ? `Article: ${p.article_url}` : null].filter(Boolean);
      lines.push(`* ${parts.join(' | ')}`);
    }
  }

  if (experiences.length > 0) {
    lines.push('\nExperience:');
    for (const exp of experiences.slice(0, 8)) {
      const title = `${exp.role} @ ${exp.company}`;
      lines.push(`* ${title}`);
    }
  }

  if (skills.length > 0) {
    lines.push('\nSkills (top):');
    for (const sk of skills
      .slice()
      .sort((a, b) => (b.proficiency || 0) - (a.proficiency || 0))
      .slice(0, 18)) {
      lines.push(`* ${sk.name}`);
    }
  }

  if (articles.length > 0) {
    lines.push('\nArticles:');
    for (const a of articles.slice(0, 8)) {
      const url = a.slug ? toPublicUrl(`/articles/${a.slug}`) : null;
      lines.push(`* ${a.title}${url ? ` | URL: ${url}` : ''}`);
    }
  }

  if (stories.length > 0) {
    lines.push('\nStories:');
    for (const s of stories.slice(0, 8)) {
      lines.push(`* ${s.title}`);
    }
  }

  return clampText(lines.join('\n'), 4200);
}

function buildHardGuardrails(userMessage: string): string {
  const m = String(userMessage || '').toLowerCase();

  const sponsorship =
    /\bvisa\b|\bsponsor(ship)?\b|\bwork authorization\b|\bwork authorisation\b|\bwork permit\b|\bh-?1b\b|\bopt\b|\bcpt\b/.test(
      m
    );

  if (sponsorship) {
    return (
      '\n\nHard rule (high-stakes): The user is asking about visa/work authorization/sponsorship. ' +
      'Do NOT infer eligibility from school, location, or timelines. ' +
      'Only state sponsorship/work-authorization facts if the SOURCES explicitly mention them. ' +
      'If the SOURCES do not explicitly state your status, you MUST answer that it is not specified and ask the user to confirm (do not hedge with guesses).'
    );
  }

  return '';
}

async function getCatalogFallbackSources(sourceTypes?: string[]): Promise<ChunkReference[]> {
  if (!isSupabaseConfigured()) return [];

  const include = new Set(
    (sourceTypes && sourceTypes.length > 0
      ? sourceTypes
      : ['project', 'article', 'skill', 'resume', 'experience']) as string[]
  );
  const groups: Record<string, ChunkReference[]> = {};

  const push = (item: Omit<ChunkReference, 'relevance_score' | 'chunk_id'> & { chunk_id: string }) => {
    const type = item.source_type || 'unknown';
    if (!groups[type]) groups[type] = [];
    groups[type].push({
      ...item,
      relevance_score: 0.02,
    });
  };

  // Always allow resume as a fallback “source” if requested
  if (include.has('resume')) {
    push({
      chunk_id: 'catalog:resume',
      source_type: 'resume',
      source_title: 'Resume',
      source_slug: null,
      source_id: null,
      content_preview: 'Download the latest resume PDF.',
    });
  }

  if (include.has('project')) {
    const { data } = await supabaseAdmin
      .from('projects')
      .select('id, title, slug, subtitle, description, tech_stack, repo_url, demo_url, article_url, is_featured')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(12);

    const rows = ((data as Project[] | null) || []).slice();
    const needsChengai = !rows.some((p) => p.slug === 'chengai');
    if (needsChengai) {
      const { data: chengai } = await supabaseAdmin
        .from('projects')
        .select('id, title, slug, subtitle, description, tech_stack, repo_url, demo_url, article_url, is_featured')
        .eq('owner_id', DEFAULT_OWNER_ID)
        .eq('status', 'published')
        .eq('slug', 'chengai')
        .is('deleted_at', null)
        .maybeSingle();

      if (chengai && !rows.some((p) => p.id === (chengai as Project).id)) {
        rows.unshift(chengai as Project);
      }
    }

    for (const p of rows) {
      const tech = Array.isArray(p.tech_stack) && p.tech_stack.length > 0 ? `Tech: ${p.tech_stack.join(', ')}\n` : '';
      const featured = p.is_featured ? 'Featured: true\n' : '';
      const links = [
        p.repo_url ? `Repo: ${p.repo_url}` : null,
        p.demo_url ? `Demo: ${p.demo_url}` : null,
        p.article_url ? `Article: ${p.article_url}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      push({
        chunk_id: `catalog:project:${p.id}`,
        source_type: 'project',
        source_title: p.title,
        source_slug: p.slug,
        source_id: p.id,
        content_preview: buildFallbackSnippet(
          `${featured}${p.subtitle ? `Subtitle: ${p.subtitle}\n` : ''}${tech}${p.description}${links ? `\n${links}` : ''}`
        ),
      });
    }
  }

  if (include.has('article')) {
    const { data } = await supabaseAdmin
      .from('articles')
      .select('id, title, slug, summary, content')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(4);

    for (const a of (data as Article[] | null) || []) {
      const body = a.content ? String(a.content) : '';
      push({
        chunk_id: `catalog:article:${a.id}`,
        source_type: 'article',
        source_title: a.title,
        source_slug: a.slug,
        source_id: a.id,
        content_preview: buildFallbackSnippet(
          a.summary ? `Summary: ${a.summary}\n\n${body}` : body || 'Published article.'
        ),
      });
    }
  }

  if (include.has('story')) {
    const { data } = await supabaseAdmin
      .from('stories')
      .select('id, title, situation, task, action, result')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .limit(4);

    for (const s of (data as Story[] | null) || []) {
      push({
        chunk_id: `catalog:story:${s.id}`,
        source_type: 'story',
        source_title: s.title,
        source_slug: null,
        source_id: s.id,
        content_preview: buildFallbackSnippet(
          `Story: ${s.title}\n\nSituation: ${s.situation}\nTask: ${s.task}\nAction: ${s.action}\nResult: ${s.result}`
        ),
      });
    }
  }

  if (include.has('skill')) {
    const { data } = await supabaseAdmin
      .from('skills')
      .select('id, name, category, proficiency, years_of_experience, is_primary')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('is_primary', { ascending: false })
      .order('proficiency', { ascending: false })
      .limit(8);

    for (const sk of (data as Skill[] | null) || []) {
      push({
        chunk_id: `catalog:skill:${sk.id}`,
        source_type: 'skill',
        source_title: sk.name,
        source_slug: null,
        source_id: sk.id,
        content_preview: `Category: ${sk.category}; Proficiency: ${sk.proficiency}/5; Years: ${sk.years_of_experience ?? 'n/a'}; Primary: ${sk.is_primary ? 'yes' : 'no'}`.slice(0, 200) + '...',
      });
    }
  }

  if (include.has('experience')) {
    const { data } = await supabaseAdmin
      .from('experiences')
      .select('id, company, role, location, employment_type, start_date, end_date, summary, highlights, tech_stack, status')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .order('start_date', { ascending: false })
      .limit(4);

    for (const exp of (data as Experience[] | null) || []) {
      const title = `${exp.role} @ ${exp.company}`;
      const meta = [
        exp.location ? `Location: ${exp.location}` : null,
        exp.employment_type ? `Type: ${exp.employment_type}` : null,
        exp.start_date || exp.end_date
          ? `Dates: ${exp.start_date || 'n/a'} to ${exp.end_date || 'Present'}`
          : null,
        Array.isArray(exp.tech_stack) && exp.tech_stack.length > 0 ? `Tech: ${exp.tech_stack.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const highlights =
        Array.isArray(exp.highlights) && exp.highlights.length > 0
          ? `\n\nHighlights:\n• ${exp.highlights.join('\n• ')}`
          : '';

      push({
        chunk_id: `catalog:experience:${exp.id}`,
        source_type: 'experience',
        source_title: title,
        source_slug: null,
        source_id: exp.id,
        content_preview: buildFallbackSnippet(
          `${title}\n${meta}${exp.summary ? `\nSummary: ${exp.summary}` : ''}${highlights}`
        ),
      });
    }
  }

  const MAX_SOURCES = 8;
  const caps: Record<string, number> = {
    resume: 1,
    project: 5,
    experience: 2,
    skill: 4,
    article: 2,
    story: 2,
  };
  const typeOrder = ['resume', 'project', 'experience', 'skill', 'article', 'story'];

  const selected: ChunkReference[] = [];
  const used: Record<string, number> = {};

  // Round-robin across requested types so we keep coverage (instead of returning 8 projects/articles only).
  while (selected.length < MAX_SOURCES) {
    let madeProgress = false;

    for (const t of typeOrder) {
      if (selected.length >= MAX_SOURCES) break;
      const cap = caps[t] ?? 2;
      if ((used[t] || 0) >= cap) continue;
      const bucket = groups[t];
      if (!bucket || bucket.length === 0) continue;

      const next = bucket.shift();
      if (!next) continue;
      selected.push(next);
      used[t] = (used[t] || 0) + 1;
      madeProgress = true;
    }

    if (!madeProgress) break;
  }

  return selected;
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory, mode, sessionContext } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sessionContextText =
      typeof sessionContext === 'string' ? sessionContext.trim().slice(0, 12000) : '';

    // Rate limiting check (simple in-memory for now)
    // TODO: Implement proper rate limiting with Redis

    // Retrieve relevant context using RAG
    const retrievalConfig = buildRetrievalConfig({
      mode,
      hasSessionContext: Boolean(sessionContextText),
    });

    const retrievalQuery = buildRetrievalQuery({
      message,
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : null,
      sessionContextText: sessionContextText || undefined,
    });

    let { context, chunks: sources } = await retrieveContext(
      retrievalQuery,
      retrievalConfig.topK,
      retrievalConfig.sourceTypes
    );

    const portfolioIndexText = await buildPortfolioIndexText();

    // If RAG returns nothing (common when content exists but embeddings haven't been built yet),
    // fall back to a small “catalog” of published content so the assistant can still list things.
    const isFallbackCatalog = !sources || sources.length === 0;
    if (!sources || sources.length === 0) {
      sources = await getCatalogFallbackSources(retrievalConfig.sourceTypes);
      sources = sortSources(sources);
      context = formatContextFromSources(sources);
    } else {
      sources = sortSources(sources);
      context = formatContextFromSources(sources);
    }

    const hasEvidence = Array.isArray(sources) && sources.length > 0;

    if (portfolioIndexText) {
      context = `${context}\n\n${portfolioIndexText}`;
    }

    // Build conversation context
    const historyContext = conversationHistory
      ? conversationHistory
          .slice(-4)
          .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
          .join('\n')
      : '';

    const augmentedSystemPrompt = hasEvidence
      ? `${CHAT_SYSTEM_PROMPT}${
          isFallbackCatalog
            ? '\n\nImportant: some SOURCES may be high-level catalog items (titles, summaries, and links), not verbatim evidence for every detail. Only claim what is explicitly supported by the snippets. If details are missing, say so and point to the most relevant pages to read next.'
            : ''
        }`
      : `${CHAT_SYSTEM_PROMPT}\n\nImportant: no directly relevant sources were retrieved for this question. State that clearly and suggest the most relevant pages to check (projects / articles / skills), or ask the user to provide more context.`;

    const hardGuardrails = buildHardGuardrails(message);

    const modeInstruction =
      mode === 'behavior'
        ? '\n\nMode: behavioral interview. Answer like a real interview: start with a short hook (why this mattered), then give just enough context, what you did (decisions + actions), and the outcome (metrics if available). Close with a brief generalization (what you learned / how you’d apply it again). Do NOT label sections as “Situation/Task/Action/Result” unless the user explicitly asks for STAR formatting. Prefer stories, but you may also use resume/experience sources when relevant.'
        : mode === 'tech'
          ? '\n\nMode: tech deep dive. Prioritize concrete technical details, trade-offs, and verifiable facts. Use the provided SOURCES (projects / resume / experience / articles) and clearly separate facts from assumptions.'
          : '';

    const sessionContextInstruction = sessionContextText
      ? '\n\nSession context: the user may provide extra context (e.g., a job description and a prior match report). Use it to answer follow-ups, but do NOT treat it as verified candidate facts unless the SOURCES explicitly support it.'
      : '';

    const userPromptParts: string[] = [];
    if (historyContext) userPromptParts.push(historyContext);
    if (sessionContextText) {
      userPromptParts.push(`Session context (user-provided):\n${sessionContextText}`);
    }
    userPromptParts.push(`User: ${message}`);
    const userPrompt = userPromptParts.join('\n\n');

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const sourcesForUi = dedupeSourcesForUi(sources);

          // First, send sources metadata
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources: sourcesForUi })}\n\n`
            )
          );

          // Stream the chat response
          for await (const tokenChunk of streamChat(
            augmentedSystemPrompt + modeInstruction + sessionContextInstruction + hardGuardrails,
            userPrompt,
            context
          )) {
            if (tokenChunk.type === 'replace') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'replace', content: tokenChunk.content })}\n\n`
                )
              );
              continue;
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'text', content: tokenChunk.content })}\n\n`
              )
            );
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: 'Generation failed' })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
