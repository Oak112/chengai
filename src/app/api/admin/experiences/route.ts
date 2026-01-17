import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { deleteSourceChunks, indexExperience } from '@/lib/indexer';

export const runtime = 'nodejs';

function isMissingTableError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ((error as { code: string }).code.toUpperCase() === '42P01')
  );
}

function migrationHint() {
  return 'Experiences table is not set up yet. Run `database/migrations/20260112_add_experiences.sql` in Supabase SQL Editor, then retry.';
}

type ExperiencePayload = {
  id?: string;
  company: string;
  role: string;
  location?: string | null;
  employment_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  summary?: string | null;
  details?: string | null;
  highlights?: string[];
  tech_stack?: string[];
  status?: string;
};

// GET all experiences for admin (including drafts)
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('experiences')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: migrationHint() }, { status: 501 });
      }
      throw error;
    }
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Admin experiences GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create experience
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = (await request.json()) as Partial<ExperiencePayload>;
    const company = String(body.company || '').trim();
    const role = String(body.role || '').trim();

    if (!company || !role) {
      return NextResponse.json({ error: 'Company and role are required' }, { status: 400 });
    }

    const payload = {
      owner_id: DEFAULT_OWNER_ID,
      company,
      role,
      location: body.location ? String(body.location).trim() : null,
      employment_type: body.employment_type ? String(body.employment_type).trim() : null,
      start_date: body.start_date ? String(body.start_date) : null,
      end_date: body.end_date ? String(body.end_date) : null,
      summary: body.summary ? String(body.summary).trim() : null,
      details: body.details ? String(body.details).trim() : null,
      highlights: Array.isArray(body.highlights) ? body.highlights : [],
      tech_stack: Array.isArray(body.tech_stack) ? body.tech_stack : [],
      status: typeof body.status === 'string' ? body.status : 'published',
    };

    let { data, error } = await supabaseAdmin
      .from('experiences')
      .insert(payload)
      .select()
      .single();

    // Backward compatibility: details column may not exist yet.
    if ((error?.code === '42703' || error?.code === 'PGRST204') && typeof payload.details !== 'undefined') {
      delete (payload as Partial<typeof payload>).details;
      const retry = await supabaseAdmin.from('experiences').insert(payload).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: migrationHint() }, { status: 501 });
      }
      throw error;
    }

    if (data?.status === 'published') {
      await indexExperience(data);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Admin experiences POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update experience
export async function PUT(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = (await request.json()) as Partial<ExperiencePayload>;
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: 'Experience ID is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { ...body };
    delete updates.id;

    if (typeof updates.company === 'string') updates.company = updates.company.trim();
    if (typeof updates.role === 'string') updates.role = updates.role.trim();
    if (typeof updates.location === 'string') updates.location = updates.location.trim();
    if (typeof updates.employment_type === 'string') updates.employment_type = updates.employment_type.trim();
    if (typeof updates.summary === 'string') updates.summary = updates.summary.trim();
    if (typeof updates.details === 'string') updates.details = updates.details.trim() || null;

    if (updates.highlights && !Array.isArray(updates.highlights)) updates.highlights = [];
    if (updates.tech_stack && !Array.isArray(updates.tech_stack)) updates.tech_stack = [];

    updates.updated_at = new Date().toISOString();

    let { data, error } = await supabaseAdmin
      .from('experiences')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID)
      .select()
      .single();

    // Backward compatibility: details column may not exist yet.
    if ((error?.code === '42703' || error?.code === 'PGRST204') && typeof updates.details !== 'undefined') {
      delete updates.details;
      const retry = await supabaseAdmin
        .from('experiences')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', DEFAULT_OWNER_ID)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: migrationHint() }, { status: 501 });
      }
      throw error;
    }

    if (data?.status === 'published') {
      await indexExperience(data);
    } else {
      await deleteSourceChunks('experience', id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin experiences PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE experience
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Experience ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('experiences')
      .delete()
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: migrationHint() }, { status: 501 });
      }
      throw error;
    }

    await deleteSourceChunks('experience', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin experiences DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
