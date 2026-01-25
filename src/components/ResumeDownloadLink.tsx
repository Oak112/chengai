'use client';

import type { ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function ResumeDownloadLink({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href="/api/resume?download=1"
      onClick={() => trackEvent('resume_download_clicked')}
      className={className}
    >
      {children}
    </a>
  );
}
