'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { gaPageView } from '@/lib/ga';

export default function GoogleAnalyticsPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() || '';

  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname;
    gaPageView(url);
  }, [pathname, search]);

  return null;
}

