import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { indexResume, deleteSourceChunks } from '@/lib/indexer';
import { extractTextFromPdf } from '@/lib/pdf';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RESUME_BUCKET = process.env.SUPABASE_RESUME_BUCKET || 'chengai-resume';
const RESUME_OBJECT_PATH = process.env.SUPABASE_RESUME_PATH || 'resume.pdf';

async function ensureResumeBucket() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw error;
  if (Array.isArray(buckets) && buckets.some((b) => b.name === RESUME_BUCKET)) return;

  const { error: createError } = await supabaseAdmin.storage.createBucket(RESUME_BUCKET, {
    public: false,
  });
  if (createError) throw createError;
}

async function parsePDF(buffer: Buffer): Promise<string> {
  return extractTextFromPdf(buffer);
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammothModule = await import('mammoth');
  const extractRawText =
    typeof mammothModule.extractRawText === 'function'
      ? mammothModule.extractRawText
      : typeof mammothModule.default?.extractRawText === 'function'
        ? mammothModule.default.extractRawText
        : null;

  if (!extractRawText) throw new Error('Invalid mammoth module export shape');

  const result = await extractRawText({ buffer });
  return result.value;
}

async function extractText(fileName: string, buffer: Buffer): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return parsePDF(buffer);
  if (ext === 'docx') return parseDocx(buffer);
  throw new Error('Unsupported resume file type');
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    await ensureResumeBucket();

    const { data, error } = await supabaseAdmin.storage
      .from(RESUME_BUCKET)
      .list('', { limit: 100, search: RESUME_OBJECT_PATH.split('/').pop() || undefined });

    if (error) throw error;

    const fileName = RESUME_OBJECT_PATH.split('/').pop() || RESUME_OBJECT_PATH;
    const match = (data || []).find((f) => f.name === fileName);

    return NextResponse.json({
      exists: Boolean(match),
      bucket: RESUME_BUCKET,
      path: RESUME_OBJECT_PATH,
      file: match
        ? {
            name: match.name,
            created_at: (match as { created_at?: string }).created_at,
            updated_at: (match as { updated_at?: string }).updated_at,
            metadata: (match as { metadata?: unknown }).metadata,
          }
        : null,
    });
  } catch (error) {
    console.error('Admin resume GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch resume status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    await ensureResumeBucket();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name || 'resume.pdf';
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (!ext || (ext !== 'pdf' && ext !== 'docx')) {
      return NextResponse.json({ error: 'Resume must be a PDF or DOCX file' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 1024) {
      return NextResponse.json({ error: 'File appears to be empty' }, { status: 400 });
    }

    const contentType =
      file.type ||
      (ext === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const { error: uploadError } = await supabaseAdmin.storage
      .from(RESUME_BUCKET)
      .upload(RESUME_OBJECT_PATH, buffer, { upsert: true, contentType });

    if (uploadError) throw uploadError;

    const text = (await extractText(fileName, buffer)).trim();
    if (text.length < 50) {
      return NextResponse.json(
        { error: 'Could not extract meaningful text from the resume file' },
        { status: 400 }
      );
    }

    await indexResume({
      id: 'resume',
      title: 'Resume',
      content: text,
      owner_id: DEFAULT_OWNER_ID,
    });

    return NextResponse.json({ success: true, bucket: RESUME_BUCKET, path: RESUME_OBJECT_PATH });
  } catch (error) {
    console.error('Admin resume POST error:', error);
    return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    await ensureResumeBucket();

    const { error } = await supabaseAdmin.storage.from(RESUME_BUCKET).remove([RESUME_OBJECT_PATH]);
    if (error) throw error;

    await deleteSourceChunks('resume', 'resume');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin resume DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete resume' }, { status: 500 });
  }
}
