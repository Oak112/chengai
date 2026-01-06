'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';

type AnalyticsResponse = {
  window_days: number;
  total: number;
  byType: Record<string, number>;
  byDay: Array<{ day: string; count: number }>;
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/admin/analytics');
        const json = await res.json();
        if (res.ok) setData(json);
      } catch (error) {
        console.error('Analytics fetch error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <BarChart3 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Analytics</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Last {data?.window_days || 7} days (anonymous events)
            </p>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          No analytics data yet.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Total events</div>
            <div className="mt-2 text-4xl font-bold text-zinc-900 dark:text-white">{data.total}</div>
            <div className="mt-4 space-y-2">
              {data.byDay.map((d) => (
                <div key={d.day} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-300">{d.day}</span>
                  <span className="font-medium text-zinc-900 dark:text-white">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">By type</div>
            <div className="space-y-2">
              {Object.entries(data.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50"
                  >
                    <span className="text-zinc-700 dark:text-zinc-200">{type}</span>
                    <span className="font-medium text-zinc-900 dark:text-white">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

