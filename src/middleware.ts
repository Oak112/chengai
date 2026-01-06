import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CSRF_COOKIE, SESSION_COOKIE, validateSessionCookieValue } from '@/lib/admin-session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin');
  const isAdminLoginApi = pathname === '/api/admin/login';
  const requiresAuth = isAdminPage || (isAdminApi && !isAdminLoginApi);

  if (requiresAuth) {
    const session = request.cookies.get(SESSION_COOKIE);
    const isValid = await validateSessionCookieValue(session?.value);

    if (!isValid) {
      // Redirect to login for page routes
      if (!pathname.startsWith('/api/')) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      // Return 401 for API routes
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate CSRF for mutating admin API requests
    const isMutating =
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.method !== 'OPTIONS';

    if (isAdminApi && !isAdminLoginApi && isMutating) {
      const csrfHeader = request.headers.get('x-csrf-token');
      const csrfCookie = request.cookies.get(CSRF_COOKIE);

      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie.value) {
        return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
      }
    }
  }
  
  // Add security headers
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/login',
  ],
};
