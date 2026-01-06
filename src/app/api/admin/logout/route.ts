import { NextResponse } from 'next/server';
import { SESSION_COOKIE, CSRF_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  // Clear cookies
  response.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  response.cookies.set(CSRF_COOKIE, '', { maxAge: 0, path: '/' });
  
  return response;
}

