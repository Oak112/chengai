import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { generateEmbeddingsBatched } from '@/lib/ai';
import { slugify } from '@/lib/slug';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ALLOWED_SOURCE_TYPES = new Set(['article', 'resume', 'story', 'project', 'skill']);

function chunkText(text: string, maxChunkSize = 1000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += para + '\n\n';
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((c) => c.trim().length >= 50);
}

function makeStableKbId(prefix: string, raw: string): string {
  const normalized = String(raw || '').trim();
  const slug = slugify(normalized) || 'untitled';
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 10);
  return `${prefix}:${slug}:${hash}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    const sourceTypeRaw = typeof body?.sourceType === 'string' ? body.sourceType : 'article';
    const sourceType = ALLOWED_SOURCE_TYPES.has(sourceTypeRaw) ? sourceTypeRaw : 'article';

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    if (!content || content.length < 50) {
      return NextResponse.json({ error: 'content is too short' }, { status: 400 });
    }

    const sourceId = makeStableKbId('kb:text', title);

    // Replace existing chunks for this entry (scoped by type + stable source id)
    await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    const chunks = chunkText(content, 1000);

    const embeddings = await generateEmbeddingsBatched(chunks, 32);
    const rows = chunks.map((chunk, i) => ({
      owner_id: DEFAULT_OWNER_ID,
      source_type: sourceType,
      source_id: sourceId,
      content: chunk,
      embedding: embeddings[i],
      metadata: {
        title,
        kb_id: sourceId,
        chunk_index: i,
        total_chunks: chunks.length,
        input_method: 'text',
      },
    }));

    const results = { inserted: 0, failed: 0 };
    const insertBatchSize = 200;
    for (let i = 0; i < rows.length; i += insertBatchSize) {
      const batch = rows.slice(i, i + insertBatchSize);
      const { error } = await supabaseAdmin.from('chunks').insert(batch);
      if (error) {
        console.error('Batch insert error:', error.message);
        results.failed += batch.length;
        continue;
      }
      results.inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      title,
      sourceId,
      totalChunks: chunks.length,
      inserted: results.inserted,
      failed: results.failed,
    });
  } catch (error) {
    console.error('Knowledge text ingest error:', error);
    return NextResponse.json({ error: 'Failed to ingest text' }, { status: 500 });
  }
}
