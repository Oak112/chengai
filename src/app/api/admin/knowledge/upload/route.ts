import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { generateEmbedding } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large files

const ALLOWED_SOURCE_TYPES = new Set(['article', 'resume', 'story', 'project', 'skill']);

// Dynamic imports for parsers
async function parsePDF(buffer: Buffer): Promise<string> {
  // pdf-parse v2 exposes a PDFParse class as a named ESM export
  const { PDFParse } = await import('pdf-parse');
  if (!PDFParse) {
    throw new Error('pdf-parse: PDFParse export not found');
  }

  // Avoid importing the worker module here (it pulls native canvas deps and breaks Turbopack builds).
  // Node.js can parse PDFs without manually wiring a worker.
  const parser = new PDFParse({ data: buffer });
  try {
    const result = (await parser.getText()) as unknown;
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (
      typeof result === 'object' &&
      result !== null &&
      'text' in result &&
      typeof (result as { text?: unknown }).text === 'string'
    ) {
      return (result as { text: string }).text;
    }
    return String(result);
  } finally {
    if (typeof parser.destroy === 'function') {
      await parser.destroy();
    }
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammothModule = await import('mammoth');
  const extractRawText =
    typeof mammothModule.extractRawText === 'function'
      ? mammothModule.extractRawText
      : typeof mammothModule.default?.extractRawText === 'function'
        ? mammothModule.default.extractRawText
        : null;

  if (!extractRawText) {
    throw new Error('Invalid mammoth module export shape');
  }

  const result = await extractRawText({ buffer });
  return result.value;
}

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

  // If no paragraphs found, split by sentences
  if (chunks.length === 0 && text.length > 0) {
    const sentences = text.split(/[.!?]+\s+/);
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += sentence + '. ';
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.filter(c => c.length > 50); // Filter out very small chunks
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sourceTypeRaw = (formData.get('sourceType') as string) || 'article';
    const sourceType = ALLOWED_SOURCE_TYPES.has(sourceTypeRaw) ? sourceTypeRaw : 'article';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name;
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse file content based on type
    let content: string;
    try {
      switch (fileExt) {
        case 'pdf':
          content = await parsePDF(buffer);
          break;
        case 'docx':
          content = await parseDocx(buffer);
          break;
        case 'txt':
        case 'md':
        case 'markdown':
          content = buffer.toString('utf-8');
          break;
        default:
          return NextResponse.json(
            { error: `Unsupported file type: ${fileExt}` },
            { status: 400 }
          );
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return NextResponse.json(
        { error: `Failed to parse ${fileExt} file` },
        { status: 500 }
      );
    }

    if (!content || content.trim().length < 10) {
      return NextResponse.json(
        { error: 'File appears to be empty or unreadable' },
        { status: 400 }
      );
    }

    // Delete existing chunks for this file
    const fileTitle = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('metadata->>title', fileTitle);

    // Chunk the content
    const chunks = chunkText(content);
    console.log(`Processing ${fileName}: ${chunks.length} chunks`);

    // Generate embeddings and insert chunks
    const results = { inserted: 0, failed: 0 };

    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i]);

        const { error } = await supabaseAdmin.from('chunks').insert({
          owner_id: DEFAULT_OWNER_ID,
          source_type: sourceType,
          source_id: fileTitle,
          content: chunks[i],
          embedding,
          metadata: {
            title: fileTitle,
            original_filename: fileName,
            chunk_index: i,
            total_chunks: chunks.length,
          },
        });

        if (error) {
          console.error(`Chunk ${i} insert error:`, error.message);
          results.failed++;
        } else {
          results.inserted++;
        }

        // Rate limiting for OpenAI API
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (embeddingError) {
        console.error(`Chunk ${i} embedding error:`, embeddingError);
        results.failed++;
      }
    }

    return NextResponse.json({
      success: true,
      fileName: fileTitle,
      totalChunks: chunks.length,
      inserted: results.inserted,
      failed: results.failed,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    );
  }
}
