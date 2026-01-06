import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createSession, getSessionCookieOptions, SESSION_COOKIE, CSRF_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

// Rate limiting state (in production, use Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0] : 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  
  if (!attempt) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }
  
  // Reset after 15 minutes
  if (now - attempt.lastAttempt > 15 * 60 * 1000) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }
  
  // Exponential backoff after 5 attempts
  if (attempt.count >= 5) {
    const backoffSeconds = Math.pow(2, attempt.count - 5) * 60;
    const waitTime = backoffSeconds * 1000 - (now - attempt.lastAttempt);
    if (waitTime > 0) {
      return { allowed: false, retryAfter: Math.ceil(waitTime / 1000) };
    }
  }
  
  attempt.count++;
  attempt.lastAttempt = now;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRateLimitKey(request);
    const rateLimit = checkRateLimit(ip);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { 
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfter) },
        }
      );
    }
    
    const { password } = await request.json();
    
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }
    
    const isValid = await verifyPassword(password);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Reset rate limit on successful login
    loginAttempts.delete(ip);
    
    // Create session
    const { sessionToken, csrfToken } = await createSession();
    
    const response = NextResponse.json({ success: true });
    
    // Set cookies
    const cookieOptions = getSessionCookieOptions();
    response.cookies.set(SESSION_COOKIE, sessionToken, cookieOptions);
    response.cookies.set(CSRF_COOKIE, csrfToken, {
      ...cookieOptions,
      httpOnly: false, // CSRF token needs to be readable by JS
    });
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

