'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function TrackedLink({
  href,
  event,
  meta,
  className,
  children,
  target,
  rel,
}: {
  href: string | { pathname: string; query?: Record<string, string> };
  event: string;
  meta?: Record<string, unknown>;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
}) {
  return (
    <Link
      href={href as never}
      className={className}
      target={target}
      rel={rel}
      onClick={() => trackEvent(event, meta)}
    >
      {children}
    </Link>
  );
}

