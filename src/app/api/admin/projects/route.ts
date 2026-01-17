import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { deleteSourceChunks, indexProject } from '@/lib/indexer';
import { slugify } from '@/lib/slug';

export const runtime = 'nodejs';

async function insertProjectWithAutoSlug(input: {
  title: string;
  slug?: string;
  description: string;
  details: string | null;
  subtitle: string | null;
  repo_url: string | null;
  demo_url: string | null;
  article_url: string | null;
  status: string;
  is_featured: boolean;
  display_order: number;
  tech_stack: string[];
}) {
  const slugProvided = Boolean(input.slug?.trim());
  const baseSlug = (input.slug?.trim() || slugify(input.title)) || `project-${Date.now()}`;

  const attemptInsert = async (slug: string, omitDetails = false) =>
    supabaseAdmin
      .from('projects')
      .insert({
        owner_id: DEFAULT_OWNER_ID,
        title: input.title,
        slug,
        description: input.description,
        ...(omitDetails ? {} : { details: input.details }),
        subtitle: input.subtitle,
        repo_url: input.repo_url,
        demo_url: input.demo_url,
        article_url: input.article_url,
        status: input.status || 'draft',
        is_featured: input.is_featured,
        display_order: input.display_order,
        tech_stack: input.tech_stack,
      })
      .select()
      .single();

  let omitDetails = false;
  let { data, error } = await attemptInsert(baseSlug, omitDetails);

  // Backward compatibility: details column may not exist yet.
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    omitDetails = true;
    ({ data, error } = await attemptInsert(baseSlug, omitDetails));
  }

  if (error?.code === '23505' && !slugProvided) {
    const unique = await ensureUniqueProjectSlug(baseSlug);
    ({ data, error } = await attemptInsert(unique, omitDetails));
  }

  if (error?.code === '23505' && slugProvided) {
    return { data: null, error: { code: '23505', message: 'Slug already exists' } as const };
  }

  if (error) {
    return { data: null, error: { code: error.code, message: error.message } as const };
  }

  return { data, error: null };
}

async function ensureUniqueProjectSlug(base: string): Promise<string> {
  const normalizedBase = base || `project-${Date.now()}`;
  for (let i = 1; i <= 25; i++) {
    const suffix = `-${i + 1}`;
    const candidate = `${normalizedBase.slice(0, 80 - suffix.length)}${suffix}`;
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('slug', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${normalizedBase.slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`;
}

// GET all projects (including drafts) for admin
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin projects GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create new project
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const {
      title,
      slug,
      description,
      details,
      subtitle,
      repo_url,
      demo_url,
      article_url,
      status,
      is_featured,
      display_order,
      tech_stack,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const { data, error } = await insertProjectWithAutoSlug({
      title: String(title).trim(),
      slug: typeof slug === 'string' ? slug.trim() : undefined,
      description: String(description).trim(),
      details: typeof details === 'string' ? details.trim() || null : null,
      subtitle: subtitle ? String(subtitle).trim() : null,
      repo_url: repo_url ? String(repo_url).trim() : null,
      demo_url: demo_url ? String(demo_url).trim() : null,
      article_url: article_url ? String(article_url).trim() : null,
      status: typeof status === 'string' ? status : 'draft',
      is_featured: Boolean(is_featured),
      display_order: typeof display_order === 'number' ? display_order : 0,
      tech_stack: Array.isArray(tech_stack) ? tech_stack : [],
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw new Error(error.message);
    }

    // Keep RAG index in sync for published projects
    if (data?.status === 'published') {
      await indexProject(data);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Admin projects POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update project
export async function PUT(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    if (typeof updates.slug === 'string') {
      const trimmed = updates.slug.trim();
      if (!trimmed) {
        delete updates.slug;
      }
    }

    if (typeof updates.details === 'string') {
      updates.details = updates.details.trim() || null;
    }

    updates.updated_at = new Date().toISOString();

    if (typeof updates.slug === 'string') {
      const trimmed = updates.slug.trim();
      if (trimmed) {
        const { data: existing, error: existsError } = await supabaseAdmin
          .from('projects')
          .select('id')
          .eq('owner_id', DEFAULT_OWNER_ID)
          .eq('slug', trimmed)
          .maybeSingle();
        if (existsError) throw existsError;
        if (existing?.id && existing.id !== id) {
          return NextResponse.json({ error: 'Slug already exists' }, { status: 409 });
        }
        updates.slug = trimmed;
      } else if (typeof updates.title === 'string' && updates.title.trim()) {
        updates.slug = await ensureUniqueProjectSlug(slugify(updates.title));
      } else {
        delete updates.slug;
      }
    }

    let { data, error } = await supabaseAdmin
      .from('projects')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID)
      .select()
      .single();

    if (
      error &&
      (error.code === '42703' || error.code === 'PGRST204') &&
      typeof updates.details !== 'undefined'
    ) {
      // Backward compatibility: details column may not exist yet.
      delete updates.details;
      const retry = await supabaseAdmin
        .from('projects')
        .update(updates)
        .eq('id', id)
        .eq('owner_id', DEFAULT_OWNER_ID)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;

    if (data?.status === 'published') {
      await indexProject(data);
    } else {
      await deleteSourceChunks('project', data.id);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin projects PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE soft delete project
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID);

    if (error) throw error;

    // Soft delete: remove indexed chunks so public chat won't cite it
    await deleteSourceChunks('project', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin projects DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
