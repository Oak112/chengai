export const SESSION_COOKIE = 'chengai_session';
export const CSRF_COOKIE = 'chengai_csrf';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

const encoder = new TextEncoder();
let cachedKeyPromise: Promise<CryptoKey> | null = null;

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') return '';
  return 'dev-insecure-admin-session-secret';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let base64: string;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    base64Url.length + ((4 - (base64Url.length % 4)) % 4),
    '='
  );

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  if (cachedKeyPromise) return cachedKeyPromise;
  cachedKeyPromise = crypto.subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return cachedKeyPromise;
}

function generateRandomHex(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createSessionCookieValue(): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET (or ADMIN_PASSWORD) must be set in production.');
  }

  const token = generateRandomHex(32);
  const expiresAtMs = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${token}.${expiresAtMs}`;

  const key = await getHmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function validateSessionCookieValue(value: string | null | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = getSessionSecret();
  if (!secret) return false;

  const parts = value.split('.');
  if (parts.length !== 3) return false;

  const [token, expiresAtMsRaw, signatureRaw] = parts;
  if (!token || !expiresAtMsRaw || !signatureRaw) return false;

  const expiresAtMs = Number(expiresAtMsRaw);
  if (!Number.isFinite(expiresAtMs)) return false;
  if (expiresAtMs <= Date.now()) return false;

    const payload = `${token}.${expiresAtMsRaw}`;
    const signature = base64UrlToBytes(signatureRaw);

    try {
      const key = await getHmacKey();
      return await crypto.subtle.verify(
        'HMAC',
        key,
        signature as unknown as BufferSource,
        encoder.encode(payload)
      );
    } catch {
      return false;
    }
  }
