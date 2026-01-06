import { NextRequest } from 'next/server';
import { retrieveContext } from '@/lib/rag';
import { streamChat, CHAT_SYSTEM_PROMPT } from '@/lib/ai';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import type { Article, ChunkReference, Project, Skill, Story } from '@/types';

export const runtime = 'nodejs';

const MAX_FALLBACK_SNIPPET_CHARS = 1800;

function buildFallbackSnippet(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  if (normalized.length <= MAX_FALLBACK_SNIPPET_CHARS) return normalized;
  return `${normalized.slice(0, MAX_FALLBACK_SNIPPET_CHARS)}…`;
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
  if (has(/\bskill(s)?\b/)) add('skill');

  return types.length > 0 ? types : undefined;
}

function getSourceHref(source: ChunkReference): string | null {
  const type = source.source_type;
  if (type === 'article' && source.source_slug) return `/articles/${source.source_slug}`;
  if (type === 'project' && source.source_slug) return `/projects/${source.source_slug}`;
  if (type === 'resume') return '/api/resume';
  if (type === 'story') return '/stories';
  if (type === 'skill') return '/skills';
  return null;
}

function buildEvidenceMarkdown(sources: ChunkReference[]): string {
  const header = '\n\n---\n\n## Evidence';
  if (!Array.isArray(sources) || sources.length === 0) {
    return `${header}\n- No direct sources were retrieved for this answer.`;
  }

  const visible = sources.slice(0, 8).map((s, idx) => ({
    index: idx + 1,
    source: s,
  }));

  const groups = new Map<
    string,
    { indexes: number[]; source: ChunkReference; href: string | null }
  >();

  for (const item of visible) {
    const href = getSourceHref(item.source);
    const keyParts = [
      item.source.source_type,
      href || '',
      item.source.source_title,
      item.source.source_slug || '',
      item.source.source_id || '',
    ];
    const key = keyParts.join('|');

    const existing = groups.get(key);
    if (existing) {
      existing.indexes.push(item.index);
      continue;
    }
    groups.set(key, { indexes: [item.index], source: item.source, href });
  }

  const lines = Array.from(groups.values())
    .sort((a, b) => a.indexes[0] - b.indexes[0])
    .map((g) => {
      const idxLabel = g.indexes.length === 1 ? String(g.indexes[0]) : g.indexes.join(', ');
      const label = g.href ? `[${g.source.source_title}](${g.href})` : g.source.source_title;
      return `- SOURCE ${idxLabel} — ${label} (${g.source.source_type})`;
    });

  return `${header}\n${lines.join('\n')}`;
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

async function getCatalogFallbackSources(sourceTypes?: string[]): Promise<ChunkReference[]> {
  if (!isSupabaseConfigured()) return [];

  const include = new Set((sourceTypes && sourceTypes.length > 0 ? sourceTypes : ['project', 'article', 'skill']) as string[]);
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

  return sources.slice(0, 8);
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory, mode } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting check (simple in-memory for now)
    // TODO: Implement proper rate limiting with Redis

    // Retrieve relevant context using RAG
    const inferredSourceTypes =
      mode === 'behavior'
        ? ['story']
        : mode === 'tech'
          ? ['project', 'article']
          : detectSourceTypes(message);

    let { context, chunks: sources } = await retrieveContext(message, 6, inferredSourceTypes);

    // If RAG returns nothing (common when content exists but embeddings haven't been built yet),
    // fall back to a small “catalog” of published content so the assistant can still list things.
    const isFallbackCatalog = !sources || sources.length === 0;
    if (!sources || sources.length === 0) {
      sources = await getCatalogFallbackSources(inferredSourceTypes);
      context = formatContextFromSources(sources);
    }

    const hasEvidence = Array.isArray(sources) && sources.length > 0;
    const evidenceMarkdown = buildEvidenceMarkdown(sources);

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

    const modeInstruction =
      mode === 'behavior'
        ? '\n\nMode: behavior. Use STAR (Situation / Task / Action / Result). Use only story evidence from the provided SOURCES.'
        : mode === 'tech'
          ? '\n\nMode: tech deep dive. Prioritize concrete technical details, trade-offs, and verifiable facts. Use only project/article evidence from the provided SOURCES.'
          : '';

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // First, send sources metadata
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'sources', sources })}\n\n`
            )
          );

          // Stream the chat response
          for await (const tokenChunk of streamChat(
            augmentedSystemPrompt + modeInstruction,
            `${historyContext}\n\nUser: ${message}`,
            context,
            evidenceMarkdown
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
