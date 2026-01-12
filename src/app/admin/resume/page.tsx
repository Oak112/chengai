'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileUp, Loader2, CheckCircle, AlertCircle, Trash2, Download } from 'lucide-react';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

type ResumeInfo = {
  exists: boolean;
  bucket: string;
  path: string;
  file: null | {
    name: string;
    created_at?: string;
    updated_at?: string;
    metadata?: unknown;
  };
};

export default function AdminResumePage() {
  const csrfToken = useMemo(() => getCookieValue('chengai_csrf'), []);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(
    null
  );

  const fetchResume = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/resume');
      if (!res.ok) throw new Error('Failed to fetch resume status');
      const data = (await res.json()) as ResumeInfo;
      setResume(data);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Failed to fetch resume status' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResume();
  }, [fetchResume]);

  const handleUpload = async (file: File) => {
    setStatus(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/resume', {
        method: 'POST',
        body: formData,
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      const parts: string[] = [];
      parts.push(data?.indexed ? 'Resume uploaded and indexed.' : 'Resume uploaded.');
      if (data?.skills?.added) {
        parts.push(`Imported ${data.skills.added} skills into Skills.`);
      }
      if (data?.warning) {
        parts.push(String(data.warning));
      }

      setStatus({
        type: data?.warning ? 'warning' : 'success',
        message: parts.join(' '),
      });
      await fetchResume();
    } catch (error) {
      console.error(error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    setStatus(null);
    setIsUploading(true);
    try {
      const res = await fetch('/api/admin/resume', {
        method: 'DELETE',
        headers: {
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Delete failed');
      }
      setStatus({ type: 'success', message: 'Resume deleted.' });
      await fetchResume();
    } catch (error) {
      console.error(error);
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Delete failed',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Resume</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload a PDF/DOCX resume. The file will power the public download and will be indexed into
          the RAG knowledge base automatically.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Current resume</h2>
            {isLoading ? (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
            ) : resume?.exists ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Uploaded: <span className="font-medium">{resume.file?.name}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No resume uploaded yet.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {resume?.exists ? (
              <Link
                href="/api/resume"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Download className="h-4 w-4" />
                Download
              </Link>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-500 opacity-60 dark:border-zinc-700 dark:text-zinc-500">
                <Download className="h-4 w-4" />
                Download
              </span>
            )}

            <button
              onClick={handleDelete}
              disabled={!resume?.exists || isUploading}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Upload new resume
          </label>
          <div className="mt-2 flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4" />
                  Choose file
                </>
              )}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">PDF or DOCX (recommended: PDF)</p>
          </div>
        </div>

        {status && (
          <div
            className={`mt-6 flex items-center gap-2 rounded-lg p-3 ${
              status.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                : status.type === 'warning'
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}
          >
            {status.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : status.type === 'warning' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="text-sm">{status.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
