'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatRoute = pathname === '/chat' || pathname.startsWith('/chat/');

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
