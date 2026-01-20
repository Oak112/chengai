import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';
import { deleteSourceChunks, indexArticle } from '@/lib/indexer';
import { slugify } from '@/lib/slug';

export const runtime = 'nodejs';

async function insertArticleWithAutoSlug(input: {
  title: string;
  slug?: string;
  content: string;
  summary: string | null;
  tags: string[];
  status: string;
}) {
  const slugProvided = Boolean(input.slug?.trim());
  const baseSlug = (input.slug?.trim() || slugify(input.title)) || `article-${Date.now()}`;

  const attemptInsert = async (slug: string) =>
    supabaseAdmin
      .from('articles')
      .insert({
        owner_id: DEFAULT_OWNER_ID,
        title: input.title,
        slug,
        content: input.content,
        summary: input.summary,
        tags: input.tags,
        status: input.status || 'draft',
        published_at: input.status === 'published' ? new Date().toISOString() : null,
      })
      .select()
      .single();

  let { data, error } = await attemptInsert(baseSlug);

  if (error?.code === '23505' && !slugProvided) {
    const unique = await ensureUniqueArticleSlug(baseSlug);
    ({ data, error } = await attemptInsert(unique));
  }

  if (error?.code === '23505' && slugProvided) {
    return { data: null, error: { code: '23505', message: 'Slug already exists' } as const };
  }

  if (error) {
    return { data: null, error: { code: error.code, message: error.message } as const };
  }

  return { data, error: null };
}

async function ensureUniqueArticleSlug(base: string): Promise<string> {
  const normalizedBase = base || `article-${Date.now()}`;
  for (let i = 1; i <= 25; i++) {
    const suffix = `-${i + 1}`;
    const candidate = `${normalizedBase.slice(0, 80 - suffix.length)}${suffix}`;
    const { data, error } = await supabaseAdmin
      .from('articles')
      .select('id')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('slug', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  return `${normalizedBase.slice(0, 60)}-${crypto.randomUUID().slice(0, 8)}`;
}

// GET all articles for admin
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('articles')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin articles GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create new article
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { title, slug, content, summary, tags, status } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      );
    }

    const { data, error } = await insertArticleWithAutoSlug({
      title: String(title).trim(),
      slug: typeof slug === 'string' ? slug.trim() : undefined,
      content: String(content),
      summary: summary ? String(summary) : null,
      tags: Array.isArray(tags) ? tags : [],
      status: typeof status === 'string' ? status : 'draft',
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw new Error(error.message);
    }

    if (data?.status === 'published') {
      await indexArticle(data);
    }

    revalidateTag('articles', 'default');
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Admin articles POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update article
export async function PUT(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { id, status, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Article ID is required' }, { status: 400 });
    }

    if (typeof updates.slug === 'string') {
      const trimmed = updates.slug.trim();
      if (!trimmed) {
        delete updates.slug;
      }
    }

    updates.updated_at = new Date().toISOString();
    
    // Set published_at when publishing
    if (status === 'published') {
      updates.status = status;
      const { data: existing } = await supabaseAdmin
        .from('articles')
        .select('published_at')
        .eq('id', id)
        .single();
      
      if (!existing?.published_at) {
        updates.published_at = new Date().toISOString();
      }
    } else if (status) {
      updates.status = status;
    }

    // If slug is explicitly provided, validate uniqueness (or auto-fix if user cleared it)
    if (typeof updates.slug === 'string') {
      const trimmed = updates.slug.trim();
      if (trimmed) {
        const { data: existing, error: existsError } = await supabaseAdmin
          .from('articles')
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
        updates.slug = await ensureUniqueArticleSlug(slugify(updates.title));
      } else {
        delete updates.slug;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('articles')
      .update(updates)
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID)
      .select()
      .single();

    if (error) throw error;

    if (data?.status === 'published') {
      await indexArticle(data);
    } else {
      await deleteSourceChunks('article', data.id);
    }

    revalidateTag('articles', 'default');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin articles PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE article
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Article ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('articles')
      .delete()
      .eq('id', id)
      .eq('owner_id', DEFAULT_OWNER_ID);

    if (error) throw error;

    await deleteSourceChunks('article', id);

    revalidateTag('articles', 'default');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin articles DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
