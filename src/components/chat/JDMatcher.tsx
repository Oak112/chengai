'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { JDMatchResult } from '@/types';
import { trackEvent } from '@/lib/analytics';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChunkReference } from '@/types';

function dedupeSources(sources: ChunkReference[]): ChunkReference[] {
  const out: ChunkReference[] = [];
  const seen = new Set<string>();

  for (const s of sources || []) {
    const slugOrTitle = s.source_slug || s.source_title || s.source_id || '';
    const key = `${s.source_type || 'unknown'}:${slugOrTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}

function getSourceHref(source: ChunkReference): string | null {
  const type = source.source_type;
  if (type === 'article' && source.source_slug) return `/articles/${source.source_slug}`;
  if (type === 'project' && source.source_slug) return `/projects/${source.source_slug}`;
  if (type === 'experience') return '/experience';
  if (type === 'resume') return '/api/resume';
  if (type === 'story') return '/stories';
  if (type === 'skill') return '/skills';
  return null;
}

export default function JDMatcher() {
  const [jd, setJd] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<JDMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!jd.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      trackEvent('jd_match_run', { jd_chars: jd.length });
      const response = await fetch('/api/jd-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze JD');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Paste Job Description
          </label>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full job description here..."
            className="w-full h-48 rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            disabled={isLoading}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!jd.trim() || isLoading}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              Analyze Match
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Match Score */}
          <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 p-6 text-white">
            <div className="text-sm opacity-80">Match Score</div>
            <div className="text-5xl font-bold">{result.match_score}%</div>
            <p className="mt-2 text-sm opacity-90 whitespace-pre-line">{result.summary}</p>
          </div>

          {/* Match Report */}
          {result.report_markdown && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="font-medium text-zinc-900 dark:text-white mb-3">
                Evidence-backed Match Report
              </h3>
              <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.report_markdown}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Sources */}
          {result.sources && result.sources.length > 0 && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="font-medium text-zinc-900 dark:text-white mb-3">
                Sources
              </h3>
              <div className="flex flex-wrap gap-2">
                {dedupeSources(result.sources).slice(0, 12).map((s) => {
                  const href = getSourceHref(s);
                  const commonClass =
                    'inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-950';

                  return href ? (
                    <Link
                      key={s.chunk_id}
                      href={href}
                      className={commonClass}
                      title={s.content_preview}
                      target={href.startsWith('/api/') ? '_blank' : undefined}
                      rel={href.startsWith('/api/') ? 'noopener noreferrer' : undefined}
                    >
                      {s.source_title}
                    </Link>
                  ) : (
                    <span key={s.chunk_id} className={commonClass} title={s.content_preview}>
                      {s.source_title}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Matched Skills */}
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="font-medium text-zinc-900 dark:text-white mb-3">
              Matched Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.matched_skills.map((ms) => (
                <span
                  key={ms.skill.id}
                  className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  <CheckCircle className="h-3 w-3" />
                  {ms.skill.name}
                </span>
              ))}
            </div>
          </div>

          {/* Gaps */}
          {result.gaps.length > 0 && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="font-medium text-zinc-900 dark:text-white mb-3">
                Potential Gaps
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.gaps.map((gap) => (
                  <span
                    key={gap}
                    className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    <XCircle className="h-3 w-3" />
                    {gap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Relevant Projects */}
          {result.relevant_projects.length > 0 && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="font-medium text-zinc-900 dark:text-white mb-3">
                Relevant Projects
              </h3>
              <div className="space-y-2">
                {result.relevant_projects.slice(0, 3).map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.slug}`}
                    className="block rounded-lg p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <div className="font-medium text-zinc-900 dark:text-white">
                      {project.title}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {project.description?.slice(0, 100)}...
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Stories */}
          {result.suggested_stories && result.suggested_stories.length > 0 && (
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="font-medium text-zinc-900 dark:text-white mb-3">
                Suggested Behavioral Stories
              </h3>
              <div className="space-y-2">
                {result.suggested_stories.map((story) => (
                  <div
                    key={story.id}
                    className="rounded-lg p-3 bg-zinc-50 dark:bg-zinc-800/50"
                  >
                    <div className="font-medium text-zinc-900 dark:text-white">
                      {story.title}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {story.situation}
                    </div>
                  </div>
                ))}
                <Link
                  href="/stories"
                  className="inline-flex text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View all stories →
                </Link>
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="flex gap-4">
            <Link
              href="/chat"
              onClick={() => trackEvent('jd_match_cta_click', { cta: 'chat' })}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
            >
              Ask AI More Questions
            </Link>
            <Link
              href="/projects"
              onClick={() => trackEvent('jd_match_cta_click', { cta: 'projects' })}
              className="flex-1 rounded-xl border border-zinc-200 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              View All Projects
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
