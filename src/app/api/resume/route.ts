import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const bucket = process.env.SUPABASE_RESUME_BUCKET || 'chengai-resume';
    const objectPath = process.env.SUPABASE_RESUME_PATH || 'resume.pdf';

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabaseAdmin.storage.from(bucket).download(objectPath);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          const contentType = data.type || 'application/pdf';
          const downloadName = objectPath.split('/').pop() || 'resume.pdf';

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename=\"${downloadName}\"`,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch (storageError) {
        console.warn('Resume storage download failed, falling back to local file:', storageError);
      }
    }

    const resumePath = join(process.cwd(), 'bank', 'Resume_TianleCheng.pdf');
    const fileBuffer = await readFile(resumePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Resume_TianleCheng.pdf"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Resume download error:', error);
    return NextResponse.json(
      { error: 'Resume not found' },
      { status: 404 }
    );
  }
}
