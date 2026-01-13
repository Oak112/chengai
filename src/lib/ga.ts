type GAParamsValue = string | number | boolean | null | undefined;

export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_GA_ID ||
  // Fallback for the live ChengAI property (non-secret, override via env if needed).
  'G-QYQWCNVYZX';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeParams(meta?: Record<string, unknown>): Record<string, GAParamsValue> | undefined {
  if (!meta) return undefined;
  const out: Record<string, GAParamsValue> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value === null) {
      out[key] = null;
    } else if (Array.isArray(value)) {
      // GA params are scalars; join simple arrays.
      const simple = value.filter((v) => typeof v === 'string') as string[];
      if (simple.length > 0) out[key] = simple.join(',');
    } else if (isRecord(value)) {
      // Avoid nested objects; skip.
      continue;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function gaPageView(url: string) {
  if (!GA_MEASUREMENT_ID) return;
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  window.gtag('config', GA_MEASUREMENT_ID, { page_path: url });
}

export function gaEvent(name: string, meta?: Record<string, unknown>) {
  if (!GA_MEASUREMENT_ID) return;
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  const params = sanitizeParams(meta);
  window.gtag('event', name, params || {});
}

