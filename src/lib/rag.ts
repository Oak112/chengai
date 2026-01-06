import { supabaseAdmin, DEFAULT_OWNER_ID } from './supabase';
import { generateEmbedding } from './ai';
import type { Chunk, ChunkReference } from '@/types';

export interface RetrievalResult {
  chunks: ChunkReference[];
  context: string;
}

const MAX_SOURCE_CONTEXT_CHARS = 1800;

function getSourceHref(source: ChunkReference): string | null {
  const type = source.source_type;
  if (type === 'article' && source.source_slug) return `/articles/${source.source_slug}`;
  if (type === 'project' && source.source_slug) return `/projects/${source.source_slug}`;
  if (type === 'resume') return '/api/resume';
  if (type === 'story') return '/stories';
  if (type === 'skill') return '/skills';
  return null;
}

function buildContextSnippet(content: string): string {
  const normalized = String(content || '').trim();
  if (!normalized) return '';
  if (normalized.length <= MAX_SOURCE_CONTEXT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_SOURCE_CONTEXT_CHARS)}…`;
}

// Hybrid search: vector + full-text
export async function retrieveContext(
  query: string,
  topK: number = 5,
  sourceTypes?: string[]
): Promise<RetrievalResult> {
  const ftsPromise = (async () => {
    let ftsQuery = supabaseAdmin.from('chunks').select('*').eq('owner_id', DEFAULT_OWNER_ID);
    if (Array.isArray(sourceTypes) && sourceTypes.length > 0) {
      ftsQuery = ftsQuery.in('source_type', sourceTypes);
    }

    const attempt = await ftsQuery
      .textSearch('fts_content', query, { type: 'websearch', config: 'english' })
      .limit(topK);

    if (!attempt.error) {
      return { results: (attempt.data as Chunk[]) || null, error: null };
    }

    const fallback = await ftsQuery
      .textSearch('content', query, { type: 'websearch', config: 'english' })
      .limit(topK);

    return { results: (fallback.data as Chunk[]) || null, error: fallback.error };
  })();

  const queryEmbeddingPromise = generateEmbedding(query);
  const queryEmbedding = await queryEmbeddingPromise;

  const vectorPromise = (async () => {
    const baseRpcArgs: Record<string, unknown> = {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lower threshold for better recall
      match_count: topK,
      p_owner_id: DEFAULT_OWNER_ID,
    };

    const rpcArgs =
      Array.isArray(sourceTypes) && sourceTypes.length > 0
        ? { ...baseRpcArgs, p_source_types: sourceTypes }
        : baseRpcArgs;

    let { data, error } = await supabaseAdmin.rpc('match_chunks', rpcArgs);

    // Backward compatibility: older SQL function may not accept p_source_types
    if (error && rpcArgs !== baseRpcArgs) {
      ({ data, error } = await supabaseAdmin.rpc('match_chunks', baseRpcArgs));
    }

    return { results: (data as Chunk[]) || null, error };
  })();

  const [{ results: vectorResults, error: vectorError }, { results: ftsResults, error: ftsError }] =
    await Promise.all([vectorPromise, ftsPromise]);

  if (vectorError) console.error('Vector search error:', vectorError);
  if (ftsError) console.error('FTS search error:', ftsError);

  // Merge and deduplicate results (RRF - Reciprocal Rank Fusion)
  const mergedResults = fuseResults(
    (vectorResults as Chunk[]) || [],
    ftsResults || [],
    topK
  );

  // Build context string
  const context = mergedResults
    .map((r, idx) => {
      const slugPart = r.source_slug ? ` (slug: ${r.source_slug})` : '';
      const url = getSourceHref(r);
      const urlLine = url ? `\nURL: ${url}` : '';
      return `SOURCE ${idx + 1}\nType: ${r.source_type}\nTitle: ${r.source_title}${slugPart}${urlLine}\nSnippet: ${r.content_preview}`;
    })
    .join('\n\n');

  return {
    chunks: mergedResults,
    context,
  };
}

// Reciprocal Rank Fusion
function fuseResults(
  vectorResults: Chunk[],
  ftsResults: Chunk[],
  topK: number
): ChunkReference[] {
  const k = 60; // RRF constant
  const scores = new Map<string, { score: number; chunk: Chunk }>();

  // Score vector results
  vectorResults.forEach((chunk, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    scores.set(chunk.id, { score: rrfScore, chunk });
  });

  // Add FTS results
  ftsResults.forEach((chunk, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    const existing = scores.get(chunk.id);
    if (existing) {
      existing.score += rrfScore;
      existing.chunk = {
        ...existing.chunk,
        ...chunk,
        metadata: {
          ...(existing.chunk.metadata || {}),
          ...(chunk.metadata || {}),
        },
      };
    } else {
      scores.set(chunk.id, { score: rrfScore, chunk });
    }
  });

  // Sort by fused score and take top K
  const sorted = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return sorted.map(({ score, chunk }) => ({
    chunk_id: chunk.id,
    source_type: chunk.source_type || 'unknown',
    source_title: getSourceTitle(chunk),
    source_id: chunk.source_id ?? null,
    source_slug: getSourceSlug(chunk),
    relevance_score: score,
    // NOTE: This is also fed to the LLM as the main grounded context.
    // Keep it long enough to include key details inside a ~1000-char chunk.
    content_preview: buildContextSnippet(chunk.content),
  }));
}

function getSourceTitle(chunk: Chunk): string {
  const metadata = chunk.metadata as Record<string, string>;
  return metadata?.title || metadata?.source_id || 'Unknown Source';
}

function getSourceSlug(chunk: Chunk): string | null {
  const metadata = chunk.metadata as Record<string, unknown>;
  const slug = metadata?.slug;
  return typeof slug === 'string' ? slug : null;
}

// For JD matching
export async function matchJDToSkills(
  jdKeywords: string[]
): Promise<ChunkReference[]> {
  const query = jdKeywords.join(' ');
  const result = await retrieveContext(query, 10);
  return result.chunks;
}
