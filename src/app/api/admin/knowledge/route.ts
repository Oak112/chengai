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
      .select('source_type, source_id, metadata, created_at')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('created_at', { ascending: false });

    if (chunksError) {
      console.error('Chunks error:', chunksError);
    }

    // Group by unique source (source_type + source_id)
    const fileMap = new Map<
      string,
      { count: number; type: string; source_id: string; created_at: string; name: string }
    >();
    
    for (const chunk of chunks || []) {
      const metadata = chunk.metadata as Record<string, string> | null;
      const name = metadata?.title || 'Unknown';
      const key = `${chunk.source_type}::${chunk.source_id}`;
      const existing = fileMap.get(key);
      
      if (existing) {
        existing.count++;
      } else {
        fileMap.set(key, {
          count: 1,
          type: chunk.source_type,
          source_id: chunk.source_id,
          created_at: chunk.created_at,
          name,
        });
      }
    }

    const files = Array.from(fileMap.values()).map((info) => ({
      name: info.name,
      chunks: info.count,
      type: info.type,
      source_id: info.source_id,
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
        experience: chunks?.filter(c => c.source_type === 'experience').length || 0,
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

    const body = await request.json().catch(() => ({}));
    const fileName = typeof body?.fileName === 'string' ? body.fileName : null;
    const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : null;
    const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : null;

    if (!sourceId || !sourceType) {
      // Backward compatibility (older UI)
      if (fileName) {
        const { error } = await supabaseAdmin
          .from('chunks')
          .delete()
          .eq('owner_id', DEFAULT_OWNER_ID)
          .eq('metadata->>title', fileName);

        if (error) {
          console.error('Delete error:', error);
          return NextResponse.json({ error: 'Failed to delete chunks' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      return NextResponse.json(
        { error: 'sourceId and sourceType are required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('chunks')
      .delete()
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

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
