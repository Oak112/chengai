import { NextRequest, NextResponse } from 'next/server';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured');
    const slug = searchParams.get('slug');

    // Single project query
    if (slug) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', DEFAULT_OWNER_ID)
        .eq('status', 'published')
        .is('deleted_at', null)
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json(
            { error: 'Project not found' },
            { status: 404 }
          );
        }
        throw error;
      }

      return NextResponse.json(data);
    }

    // List projects query
    let query = supabase
      .from('projects')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Projects API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

