'use client';

import Link from 'next/link';
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
    <Link
      href="/api/resume"
      onClick={() => trackEvent('resume_download_clicked')}
      className={className}
    >
      {children}
    </Link>
  );
}
