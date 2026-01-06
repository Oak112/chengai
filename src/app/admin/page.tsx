'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Code, FileText, Briefcase, Database, ScrollText, BarChart3, LogOut, RefreshCw, Loader2, CheckCircle, AlertCircle, IdCard } from 'lucide-react';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildStatus, setRebuildStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [rebuildMessage, setRebuildMessage] = useState('');
  const router = useRouter();

  const handleLogout = async () => {
    setIsLoading(true);
    const csrfToken = getCookieValue('chengai_csrf');
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
    });
    router.push('/');
  };

  const handleRebuild = async () => {
    setIsRebuilding(true);
    setRebuildStatus('idle');
    setRebuildMessage('');

    try {
      const csrfToken = getCookieValue('chengai_csrf');
      const response = await fetch('/api/admin/rebuild', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });
      const data = await response.json();

      if (response.ok) {
        setRebuildStatus('success');
        setRebuildMessage(`Created ${data.chunks_created} chunks`);
      } else {
        setRebuildStatus('error');
        setRebuildMessage(data.error || 'Failed to rebuild');
      }
    } catch {
      setRebuildStatus('error');
      setRebuildMessage('Network error');
    } finally {
      setIsRebuilding(false);
    }
  };

  const adminCards = [
    {
      title: 'Projects',
      description: 'Manage your project portfolio',
      icon: Code,
      href: '/admin/projects',
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Resume',
      description: 'Upload and manage your resume',
      icon: IdCard,
      href: '/admin/resume',
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      title: 'Skills',
      description: 'Update your skill set',
      icon: Briefcase,
      href: '/admin/skills',
      color: 'from-purple-500 to-purple-600',
    },
    {
      title: 'Articles',
      description: 'Write and publish articles',
      icon: FileText,
      href: '/admin/articles',
      color: 'from-green-500 to-green-600',
    },
    {
      title: 'Stories',
      description: 'Manage STAR interview stories',
      icon: ScrollText,
      href: '/admin/stories',
      color: 'from-pink-500 to-pink-600',
    },
    {
      title: 'Knowledge Base',
      description: 'Manage RAG chunks and embeddings',
      icon: Database,
      href: '/admin/knowledge',
      color: 'from-orange-500 to-orange-600',
    },
    {
      title: 'Analytics',
      description: 'View funnel + event metrics',
      icon: BarChart3,
      href: '/admin/analytics',
      color: 'from-slate-500 to-slate-600',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage your content and settings
          </p>
        </div>
        <button
          onClick={handleLogout}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {adminCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className={`inline-flex rounded-xl bg-gradient-to-br ${card.color} p-3`}>
              <card.icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              {card.title}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {card.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRebuild}
            disabled={isRebuilding}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isRebuilding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rebuilding...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Rebuild Embeddings
              </>
            )}
          </button>

          {rebuildStatus === 'success' && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              {rebuildMessage}
            </div>
          )}

          {rebuildStatus === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {rebuildMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
