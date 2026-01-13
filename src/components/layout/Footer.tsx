'use client';

import Link from 'next/link';
import { Github, Linkedin, Mail } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          {/* Copyright */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            © {new Date().getFullYear()} Charlie Cheng. Built with ChengAI.
          </p>

          {/* Links */}
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/Oak112"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('outbound_click', { destination: 'github' })}
              className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub</span>
            </Link>
            <Link
              href="https://www.linkedin.com/in/charlie-tianle-cheng-6147a4325"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('outbound_click', { destination: 'linkedin' })}
              className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <Linkedin className="h-5 w-5" />
              <span className="sr-only">LinkedIn</span>
            </Link>
            <Link
              href="mailto:charliecheng112@gmail.com"
              onClick={() => trackEvent('outbound_click', { destination: 'email' })}
              className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <Mail className="h-5 w-5" />
              <span className="sr-only">Email</span>
            </Link>
          </div>

          {/* Admin Link */}
          <Link
            href="/login"
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
          >
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
