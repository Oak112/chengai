import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_OWNER_ID, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return null;
  return forwarded.split(',')[0]?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const type = typeof body?.type === 'string' ? body.type.trim() : '';
    const meta = typeof body?.meta === 'object' && body?.meta !== null ? body.meta : {};

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: true, skipped: 'db_not_configured' });
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent');
    const referer = request.headers.get('referer');

    const visitorIdCookie = request.cookies.get('chengai_vid');
    const visitorId = visitorIdCookie?.value || crypto.randomUUID();

    const { error } = await supabaseAdmin.from('events').insert({
      owner_id: DEFAULT_OWNER_ID,
      visitor_id: visitorId,
      type,
      ip,
      user_agent: userAgent,
      referer,
      meta,
    });

    if (error) {
      console.error('Event insert error:', error);
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    if (!visitorIdCookie) {
      res.cookies.set('chengai_vid', visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }
    return res;
  } catch (error) {
    console.error('Track event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

