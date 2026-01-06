'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

function trackEvent(type: string, meta?: Record<string, unknown>) {
  try {
    void fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, meta: meta || {} }),
    });
  } catch {
    // ignore
  }
}

export default function ResumeDownloadLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/api/resume"
      onClick={() => trackEvent('resume_download_clicked')}
      className={className}
    >
      {children}
    </Link>
  );
}
