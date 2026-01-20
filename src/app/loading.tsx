export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-52 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-80 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="h-28 w-full rounded-xl bg-zinc-100 dark:bg-zinc-950/40" />
              <div className="mt-5 h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="mt-3 h-4 w-full rounded bg-zinc-100 dark:bg-zinc-900" />
              <div className="mt-2 h-4 w-2/3 rounded bg-zinc-100 dark:bg-zinc-900" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

