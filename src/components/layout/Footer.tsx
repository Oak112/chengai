'use client';

import Link from 'next/link';
import { Github, Linkedin, Mail } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import type { SiteSettings } from '@/lib/site-settings-types';

export default function Footer({ settings }: { settings: SiteSettings }) {
  const { profile, visibility } = settings;
  const showLinks = visibility.github || visibility.linkedin || visibility.email;

  return (
    <footer className="border-t border-zinc-200/70 bg-white/60 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          {/* Copyright */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            © {new Date().getFullYear()} {profile.displayName}. Built with ChengAI.
          </p>

          {/* Links */}
          {showLinks && (
            <div className="flex items-center gap-4">
              {visibility.github && (
                <Link
                  href={profile.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('outbound_click', { destination: 'github' })}
                  className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  <Github className="h-5 w-5" />
                  <span className="sr-only">{profile.githubLabel}</span>
                </Link>
              )}
              {visibility.linkedin && (
                <Link
                  href={profile.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('outbound_click', { destination: 'linkedin' })}
                  className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  <Linkedin className="h-5 w-5" />
                  <span className="sr-only">{profile.linkedinLabel}</span>
                </Link>
              )}
              {visibility.email && (
                <Link
                  href={`mailto:${profile.email}`}
                  onClick={() => trackEvent('outbound_click', { destination: 'email' })}
                  className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  <Mail className="h-5 w-5" />
                  <span className="sr-only">Email</span>
                </Link>
              )}
            </div>
          )}

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
