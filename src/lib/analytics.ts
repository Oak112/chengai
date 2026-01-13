'use client';

import { gaEvent } from '@/lib/ga';

export function trackEvent(type: string, meta?: Record<string, unknown>) {
  try {
    void fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, meta: meta || {} }),
    });
  } catch {
    // ignore
  }

  try {
    gaEvent(type, meta);
  } catch {
    // ignore
  }
}

