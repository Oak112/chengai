'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatRoute = pathname === '/chat' || pathname.startsWith('/chat/');

  useEffect(() => {
    if (!isChatRoute) return;

    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = (document.body.style as CSSStyleDeclaration & { overscrollBehavior?: string })
      .overscrollBehavior;

    document.body.style.overflow = 'hidden';
    (document.body.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior =
      'none';

    return () => {
      document.body.style.overflow = prevOverflow;
      (document.body.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior =
        prevOverscroll || '';
    };
  }, [isChatRoute]);

  return (
    <div
      className={
        isChatRoute
          ? 'flex h-[100dvh] flex-col overflow-hidden'
          : 'flex min-h-[100dvh] flex-col'
      }
    >
      <Header />
      <main className={isChatRoute ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0'}>
        {children}
      </main>
      {!isChatRoute && <Footer />}
    </div>
  );
}
