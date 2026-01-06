import { cookies } from 'next/headers';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookieValue,
  validateSessionCookieValue,
} from '@/lib/admin-session';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Simple session management (in production, use proper JWT or session store)
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateCSRFToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string): Promise<boolean> {
  const expected =
    ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
  if (!expected) return false;
  return password === expected;
}

export async function createSession(): Promise<{ sessionToken: string; csrfToken: string }> {
  const sessionToken = await createSessionCookieValue();
  const csrfToken = generateCSRFToken();
  
  // In production, store session in database with expiry
  return { sessionToken, csrfToken };
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return await validateSessionCookieValue(session?.value);
}

export async function getCSRFToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const csrf = cookieStore.get(CSRF_COOKIE);
  return csrf?.value || null;
}

export async function validateCSRF(token: string): Promise<boolean> {
  const storedToken = await getCSRFToken();
  return storedToken === token;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  };
}

export { SESSION_COOKIE, CSRF_COOKIE };
