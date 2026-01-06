import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

// GET - Get knowledge base stats and chunks list
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get total chunks count
    const { count: totalChunks, error: countError } = await supabaseAdmin
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', DEFAULT_OWNER_ID);

    if (countError) {
      console.error('Count error:', countError);
    }

    // Get chunks grouped by source type
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('chunks')
      .select('id, source_type, metadata, created_at')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('created_at', { ascending: false });

    if (chunksError) {
      console.error('Chunks error:', chunksError);
    }

    // Group by source file (from metadata.title)
    const fileMap = new Map<string, { count: number; type: string; created_at: string }>();
    
    for (const chunk of chunks || []) {
      const metadata = chunk.metadata as Record<string, string> | null;
      const title = metadata?.title || 'Unknown';
      const existing = fileMap.get(title);
      
      if (existing) {
        existing.count++;
      } else {
        fileMap.set(title, {
          count: 1,
          type: chunk.source_type,
          created_at: chunk.created_at,
        });
      }
    }

    const files = Array.from(fileMap.entries()).map(([name, info]) => ({
      name,
      chunks: info.count,
      type: info.type,
      created_at: info.created_at,
    }));

    // Count by source type
    const stats = {
      total: totalChunks || 0,
      byType: {
        article: chunks?.filter(c => c.source_type === 'article').length || 0,
        project: chunks?.filter(c => c.source_type === 'project').length || 0,
        resume: chunks?.filter(c => c.source_type === 'resume').length || 0,
        story: chunks?.filter(c => c.source_type === 'story').length || 0,
        skill: chunks?.filter(c => c.source_type === 'skill').length || 0,
      },
    };

    return NextResponse.json({ stats, files });
  } catch (error) {
    console.error('Knowledge API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch knowledge base stats' },
      { status: 500 }
    );
  }
}

// DELETE - Delete chunks by file name
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { fileName } = await request.json();

    if (!fileName) {
      return NextResponse.json(
        { error: 'fileName is required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('metadata->>title', fileName);

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json(
        { error: 'Failed to delete chunks' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete API error:', error);
    return NextResponse.json(
      { error: 'Failed to delete chunks' },
      { status: 500 }
    );
  }
}
