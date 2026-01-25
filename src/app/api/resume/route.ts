import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

function getContentDisposition(request: NextRequest, fileName: string): string {
  const url = new URL(request.url);
  const download = url.searchParams.get('download');
  const forceDownload = download === '1' || download?.toLowerCase() === 'true';
  const type = forceDownload ? 'attachment' : 'inline';
  return `${type}; filename=\"${fileName}\"`;
}

export async function GET(request: NextRequest) {
  try {
    const bucket = process.env.SUPABASE_RESUME_BUCKET || 'chengai-resume';
    const objectPath = process.env.SUPABASE_RESUME_PATH || 'resume.pdf';
    const downloadName = 'Resume_CharlieCheng.pdf';
    const isProd = process.env.NODE_ENV === 'production';
    const contentDisposition = getContentDisposition(request, downloadName);

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabaseAdmin.storage.from(bucket).download(objectPath);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);
          const contentType = data.type || 'application/pdf';

          return new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': contentDisposition,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch (storageError) {
        console.warn('Resume storage download failed, falling back to local file:', storageError);
      }

      // In production deployments we do not ship the local `bank/` folder,
      // so avoid noisy ENOENT logs and return a clean 404.
      if (isProd) {
        return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
      }
    }

    const resumePath = join(process.cwd(), 'bank', 'Resume_TianleCheng.pdf');
    const fileBuffer = await readFile(resumePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
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
