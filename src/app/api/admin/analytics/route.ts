import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { data, error } = await supabaseAdmin
      .from('events')
      .select('type, created_at')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    const byType: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    for (const e of data || []) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      const day = isoDay(new Date(e.created_at));
      byDay[day] = (byDay[day] || 0) + 1;
    }

    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
      const key = isoDay(d);
      return { day: key, count: byDay[key] || 0 };
    });

    return NextResponse.json({
      window_days: 7,
      total: data?.length || 0,
      byType,
      byDay: days,
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

