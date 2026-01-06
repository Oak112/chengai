import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { generateEmbeddingsBatched } from '@/lib/ai';

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

    // Replace existing chunks for this title
    await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('metadata->>title', title);

    const chunks = chunkText(content, 1000);

    const embeddings = await generateEmbeddingsBatched(chunks, 32);
    const rows = chunks.map((chunk, i) => ({
      owner_id: DEFAULT_OWNER_ID,
      source_type: sourceType,
      source_id: title,
      content: chunk,
      embedding: embeddings[i],
      metadata: {
        title,
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
      totalChunks: chunks.length,
      inserted: results.inserted,
      failed: results.failed,
    });
  } catch (error) {
    console.error('Knowledge text ingest error:', error);
    return NextResponse.json({ error: 'Failed to ingest text' }, { status: 500 });
  }
}
