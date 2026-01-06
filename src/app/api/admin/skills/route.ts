import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { deleteSourceChunks, indexSkill } from '@/lib/indexer';

export const runtime = 'nodejs';

// GET all skills for admin
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('skills')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('category')
      .order('proficiency', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin skills GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create new skill
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { name, category, proficiency, years_of_experience, icon, is_primary } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('skills')
      .insert({
        owner_id: DEFAULT_OWNER_ID,
        name,
        category: category || 'other',
        proficiency: proficiency || 3,
        years_of_experience: years_of_experience || null,
        icon: icon || null,
        is_primary: is_primary || false,
      })
      .select()
      .single();

    if (error) throw error;

    await indexSkill(data);

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Admin skills POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update skill
export async function PUT(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('skills')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID)
      .select()
      .single();

    if (error) throw error;

    await indexSkill(data);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin skills PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE skill
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Skill ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('skills')
      .delete()
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID);

    if (error) throw error;

    await deleteSourceChunks('skill', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin skills DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
