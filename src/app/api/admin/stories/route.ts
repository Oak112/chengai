import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { deleteSourceChunks, indexStory } from '@/lib/indexer';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin stories GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const {
      title,
      situation,
      task,
      action,
      result,
      skills_demonstrated,
      project_id,
      is_public,
      redacted,
    } = body;

    if (!title || !situation || !task || !action || !result) {
      return NextResponse.json(
        { error: 'title, situation, task, action, and result are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('stories')
      .insert({
        owner_id: DEFAULT_OWNER_ID,
        title,
        situation,
        task,
        action,
        result,
        skills_demonstrated: Array.isArray(skills_demonstrated) ? skills_demonstrated : [],
        project_id: project_id || null,
        is_public: typeof is_public === 'boolean' ? is_public : true,
        redacted: typeof redacted === 'boolean' ? redacted : false,
      })
      .select()
      .single();

    if (error) throw error;

    if (data.is_public) {
      await indexStory(data);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Admin stories POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Story ID is required' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();
    if (updates.project_id === '') updates.project_id = null;
    if (updates.skills_demonstrated && !Array.isArray(updates.skills_demonstrated)) {
      updates.skills_demonstrated = [];
    }

    const { data, error } = await supabaseAdmin
      .from('stories')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID)
      .select()
      .single();

    if (error) throw error;

    if (data.is_public) {
      await indexStory(data);
    } else {
      await deleteSourceChunks('story', id);
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin stories PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Story ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('stories')
      .delete()
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID);

    if (error) throw error;

    await deleteSourceChunks('story', id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin stories DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
