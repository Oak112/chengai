import { NextRequest } from 'next/server';
import { retrieveContext } from '@/lib/rag';
import { streamChat, CHAT_SYSTEM_PROMPT } from '@/lib/ai';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { extractSkillsFromText } from '@/lib/skills-import';
import type { Article, ChunkReference, Experience, Project, Skill, Story } from '@/types';

export const runtime = 'nodejs';

const MAX_FALLBACK_SNIPPET_CHARS = 1800;
const MAX_RETRIEVAL_QUERY_CHARS = 2600;

type ChatIntent =
  | 'internships'
  | 'skills'
  | 'projects'
  | 'cover_letter'
  | 'job_search'
  | 'all_resources'
  | 'general';

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

function detectSourceTypes(message: string): string[] | undefined {
  const m = message.toLowerCase();
  const has = (re: RegExp) => re.test(message) || re.test(m);
  const types: string[] = [];
  const add = (t: string) => {
    if (!types.includes(t)) types.push(t);
  };

  if (has(/\bproject(s)?\b|\bportfolio\b/)) add('project');
  if (has(/\barticle(s)?\b|\bblog\b|\bpost(s)?\b/)) add('article');
  if (has(/\bstory\b|\bstories\b|\bstar\b|\bbehavior(al)?\b/)) add('story');
  if (has(/\bresume\b|\bcv\b/)) add('resume');
  if (has(/\bexperience\b|\bwork\b|\bemployment\b|\bintern(ship)?\b|\bprofessional\b|\bjob\b/)) add('experience');
  if (has(/\bskill(s)?\b/)) add('skill');

  return types.length > 0 ? types : undefined;
}

function detectChatIntent(message: string): ChatIntent {
  const m = String(message || '').toLowerCase();
  const has = (re: RegExp) => re.test(m);

  if (has(/\bgo through\b|\ball resources\b|\beverything\b|\bread all\b|\buse all\b/)) return 'all_resources';
  if (has(/\bintern(ship)?s?\b|\bintern\b|\bco-?op\b/)) return 'internships';
  if (has(/\bcover letter\b|\breferral\b|\boutreach\b|\bapplication\b|\bapply\b/)) return 'cover_letter';
  if (has(/\bjob\b|\bjd\b|\bmatch\b|\brole\b|\brecruiter\b|\bhiring\b/)) return 'job_search';
  if (has(/\bproject(s)?\b|\bportfolio\b|\bcase study\b/)) return 'projects';
  if (has(/\bskill(s)?\b|\btech stack\b|\bproficien/)) return 'skills';

  return 'general';
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
  message: string;
  mode?: 'auto' | 'tech' | 'behavior';
  requestedSourceTypes?: string[];
  hasSessionContext: boolean;
}): { sourceTypes?: string[]; topK: number; intent: ChatIntent } {
  const intent = detectChatIntent(args.message);

  if (args.mode === 'behavior') {
    return { intent, topK: 10, sourceTypes: ['story', 'experience', 'resume'] };
  }

  if (args.mode === 'tech') {
    return { intent, topK: 10, sourceTypes: ['project', 'article', 'resume', 'skill', 'experience'] };
  }

  if (intent === 'all_resources') {
    return {
      intent,
      topK: 16,
      sourceTypes: ['resume', 'experience', 'project', 'story', 'article', 'skill'],
    };
  }

  if (intent === 'internships') {
    return { intent, topK: 12, sourceTypes: ['experience', 'resume', 'story'] };
  }

  if (intent === 'projects') {
    return { intent, topK: 10, sourceTypes: ['project', 'resume', 'article'] };
  }

  if (intent === 'skills') {
    return { intent, topK: 10, sourceTypes: ['skill', 'resume', 'project', 'experience'] };
  }

  if (intent === 'cover_letter') {
    return {
      intent,
      topK: 14,
      sourceTypes: ['resume', 'experience', 'project', 'story', 'article', 'skill'],
    };
  }

  if (intent === 'job_search' || args.hasSessionContext) {
    return {
      intent,
      topK: 12,
      sourceTypes: ['resume', 'experience', 'project', 'story', 'skill', 'article'],
    };
  }

  if (Array.isArray(args.requestedSourceTypes) && args.requestedSourceTypes.length > 0) {
    return {
      intent,
      topK: 9,
      sourceTypes: Array.from(new Set([...args.requestedSourceTypes, 'resume', 'skill', 'experience'])),
    };
  }

  return { intent, topK: 9, sourceTypes: undefined };
}

function buildIntentInstruction(intent: ChatIntent): string {
  switch (intent) {
    case 'internships':
      return (
        '\n\nAnswer style (internships): Give a concise list of internships/work experiences. ' +
        'For each, include company, role, dates (if available), and 2–3 concrete highlights. ' +
        'If dates or metrics are missing in SOURCES, omit them instead of guessing.'
      );
    case 'skills':
      return (
        '\n\nAnswer style (skills): List the top 5–8 skills and briefly connect each to at least one project/experience when possible. ' +
        'Prefer specificity over generic statements.'
      );
    case 'projects':
      return (
        '\n\nAnswer style (projects): List 3–5 representative projects. For each: 1-line what it is + 1-line what I built/did. ' +
        'Avoid invented metrics; keep it crisp.'
      );
    case 'cover_letter':
      return (
        '\n\nAnswer style (applications): Write in a real application voice (not a meta analysis). ' +
        'Do not add a "Relevant facts from sources" preamble. Keep it skimmable and specific.'
      );
    case 'job_search':
      return (
        '\n\nAnswer style (job search): Be persuasive but honest. Use evidence when available; if a requirement is not covered, say so and propose a fast way to validate.'
      );
    case 'all_resources':
      return (
        '\n\nAnswer style (all resources): Summarize across resume, experience, projects, skills, and writing. ' +
        'Organize the answer into 3–5 sections with short bullets (no long walls of text).'
      );
    default:
      return '\n\nAnswer style: Be direct and helpful. Offer a concrete answer first, then optional next steps.';
  }
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
  const sources: ChunkReference[] = [];

  const push = (item: Omit<ChunkReference, 'relevance_score' | 'chunk_id'> & { chunk_id: string }) => {
    sources.push({
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
      .limit(4);

    for (const p of (data as Project[] | null) || []) {
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
        exp.start_date || exp.end_date ? `Dates: ${exp.start_date || 'n/a'} — ${exp.end_date || 'Present'}` : null,
        Array.isArray(exp.tech_stack) && exp.tech_stack.length > 0 ? `Tech: ${exp.tech_stack.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const highlights =
        Array.isArray(exp.highlights) && exp.highlights.length > 0
          ? `\n\nHighlights:\n- ${exp.highlights.join('\n- ')}`
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

  return sources.slice(0, 8);
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
    const requestedSourceTypes = detectSourceTypes(message);
    const retrievalConfig = buildRetrievalConfig({
      message,
      mode,
      requestedSourceTypes,
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

    // If RAG returns nothing (common when content exists but embeddings haven't been built yet),
    // fall back to a small “catalog” of published content so the assistant can still list things.
    const isFallbackCatalog = !sources || sources.length === 0;
    if (!sources || sources.length === 0) {
      sources = await getCatalogFallbackSources(retrievalConfig.sourceTypes);
      context = formatContextFromSources(sources);
    }

    const hasEvidence = Array.isArray(sources) && sources.length > 0;

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
            ? '\n\nImportant: the SOURCES below may be a high-level catalog of available items, not necessarily direct evidence for the user’s exact question. Only claim what is explicitly supported by the snippets. If details are missing, say so and point to the most relevant sources to read next.'
            : ''
        }`
      : `${CHAT_SYSTEM_PROMPT}\n\nImportant: no directly relevant sources were retrieved for this question. State that clearly and suggest the most relevant pages to check (projects / articles / skills), or ask the user to provide more context.`;

    const hardGuardrails = buildHardGuardrails(message);
    const intentInstruction = buildIntentInstruction(retrievalConfig.intent);

    const modeInstruction =
      mode === 'behavior'
        ? '\n\nMode: behavior. Use STAR (Situation / Task / Action / Result). Prefer stories, but you may also use resume/experience sources when relevant.'
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
            augmentedSystemPrompt + modeInstruction + intentInstruction + sessionContextInstruction + hardGuardrails,
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
