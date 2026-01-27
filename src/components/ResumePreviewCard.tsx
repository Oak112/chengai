'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Download, Expand, FileText, X } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

const RESUME_PREVIEW_URL = '/api/resume';
const RESUME_DOWNLOAD_URL = '/api/resume?download=1';

export default function ResumePreviewCard() {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const onOpen = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches) {
      // On small screens, open the PDF viewer directly for a better mobile experience.
      trackEvent('resume_preview_opened', { page: 'home', surface: 'mobile_fullscreen' });
      window.location.assign(RESUME_PREVIEW_URL);
      return;
    }
    trackEvent('resume_preview_opened', { page: 'home' });
    setIsOpen(true);
  }, []);

  const onClose = useCallback(() => {
    trackEvent('resume_preview_closed', { page: 'home' });
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsSmallScreen(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const onDownloadClick = useCallback(() => {
    trackEvent('resume_download_clicked', { page: 'home', location: 'resume_preview' });
  }, []);

  return (
    <>
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            <div className="text-left">
              <h3 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-white">
                Resume
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Scroll to preview. Expand for full view.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200 dark:hover:bg-zinc-950"
            >
              <Expand className="h-4 w-4" />
              Expand
            </button>

            <a
              href={RESUME_DOWNLOAD_URL}
              onClick={onDownloadClick}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          {isSmallScreen ? (
            <button
              type="button"
              onClick={onOpen}
              className="flex h-[360px] w-full items-center justify-center gap-3 px-6 text-sm font-semibold text-zinc-700 transition-colors hover:bg-white/60 dark:text-zinc-200 dark:hover:bg-zinc-950/40"
              aria-label="Open resume preview"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-sm">
                <FileText className="h-5 w-5" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-semibold">Tap to open resume</span>
                <span className="mt-0.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Opens a full screen viewer for the best mobile experience.
                </span>
              </span>
            </button>
          ) : (
            <iframe
              src={`${RESUME_PREVIEW_URL}#view=FitH`}
              title="Resume preview"
              className="h-[420px] w-full"
              loading="lazy"
            />
          )}
        </div>
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">Resume</span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={RESUME_DOWNLOAD_URL}
                  onClick={onDownloadClick}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200 dark:hover:bg-zinc-950"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200 dark:hover:bg-zinc-950"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <iframe
              src={`${RESUME_PREVIEW_URL}#view=FitH`}
              title="Resume full view"
              className="h-[85vh] w-full"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
