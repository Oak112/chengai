'use client';

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Check, Copy, Github, GraduationCap, Linkedin } from 'lucide-react';
import TrackedLink from '@/components/TrackedLink';
import { trackEvent } from '@/lib/analytics';

const EMAIL = 'charliecheng112@gmail.com';
const GITHUB_URL = 'https://github.com/Oak112';
const LINKEDIN_URL = 'https://www.linkedin.com/in/charlie-tianle-cheng-6147a4325';

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function HeroIdentityBar() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopyEmail = useCallback(async () => {
    trackEvent('copy_email', { page: 'home' });
    const ok = await copyToClipboard(EMAIL);
    setCopied(ok);
  }, []);

  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200">
          <GraduationCap className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          NYU (M.S., Urban Data Science), Graduate at May 2026
        </span>

        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          <Briefcase className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          Actively seeking full-time Software, AI, or ML Engineer roles
        </span>

        <button
          type="button"
          onClick={onCopyEmail}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
          aria-label="Copy email"
        >
          <span className="select-all">{EMAIL}</span>
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          )}
        </button>

        <TrackedLink
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          event="contact_click"
          meta={{ page: 'home', target: 'linkedin' }}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
        >
          <Linkedin className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          LinkedIn
        </TrackedLink>

        <TrackedLink
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          event="contact_click"
          meta={{ page: 'home', target: 'github' }}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
        >
          <Github className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          GitHub
        </TrackedLink>
      </div>
    </div>
  );
}
