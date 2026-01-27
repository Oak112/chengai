type GAParamsValue = string | number | boolean | null | undefined;

const DEFAULT_GA_MEASUREMENT_IDS = [
  // Existing live property (do not remove)
  'G-QYQWCNVYZX',
  // chengai.me property (added, keep both)
  'G-5Q5KK2QLKL',
];

function parseMeasurementIds(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeMeasurementId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  // GA4 measurement ids look like "G-XXXXXXXXXX". Keep validation loose but safe.
  if (!/^G-[A-Z0-9]+$/i.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function buildGaMeasurementIds(): string[] {
  const ids = [
    ...parseMeasurementIds(process.env.NEXT_PUBLIC_GA_MEASUREMENT_IDS || process.env.NEXT_PUBLIC_GA_IDS),
    ...parseMeasurementIds(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_ID),
    ...DEFAULT_GA_MEASUREMENT_IDS,
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const normalized = normalizeMeasurementId(raw);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export const GA_MEASUREMENT_IDS = buildGaMeasurementIds();

// Backward-compatible single id (primary). Used to load the gtag.js script.
export const GA_MEASUREMENT_ID = GA_MEASUREMENT_IDS[0] || '';

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
  if (GA_MEASUREMENT_IDS.length === 0) return;
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  for (const id of GA_MEASUREMENT_IDS) {
    window.gtag('config', id, { page_path: url });
  }
}

export function gaEvent(name: string, meta?: Record<string, unknown>) {
  if (GA_MEASUREMENT_IDS.length === 0) return;
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  const params = sanitizeParams(meta) || {};

  // Send explicitly to each configured GA4 property, so we keep the legacy property
  // while adding new domains/streams.
  for (const id of GA_MEASUREMENT_IDS) {
    window.gtag('event', name, { ...params, send_to: id });
  }
}
