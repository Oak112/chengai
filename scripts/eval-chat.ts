import { writeFile } from 'fs/promises';
import { join } from 'path';

type Mode = 'auto' | 'tech' | 'behavior';

type EvalCase = {
  id: string;
  mode: Mode;
  message: string;
};

type EvalResult = {
  id: string;
  mode: Mode;
  message: string;
  ok: boolean;
  status: number;
  elapsed_ms: number;
  content: string;
  sources: unknown[];
};

async function runCase(baseUrl: string, test: EvalCase): Promise<EvalResult> {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: test.message, conversationHistory: [], mode: test.mode }),
  });

  const elapsedStart = Date.now() - started;

  if (!res.body) {
    return {
      ...test,
      ok: false,
      status: res.status,
      elapsed_ms: elapsedStart,
      content: '',
      sources: [],
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let content = '';
  let sources: unknown[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const dataLines = event
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6));

        if (dataLines.length === 0) continue;
        const payload = dataLines.join('\n');
        if (payload === '[DONE]') {
          return {
            ...test,
            ok: res.ok,
            status: res.status,
            elapsed_ms: Date.now() - started,
            content,
            sources,
          };
        }

        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          const type = parsed.type;
          if (type === 'sources' && Array.isArray(parsed.sources)) {
            sources = parsed.sources;
          } else if (type === 'replace' && typeof parsed.content === 'string') {
            content = parsed.content;
          } else if (type === 'text' && typeof parsed.content === 'string') {
            content += parsed.content;
          }
        } catch {
          // ignore malformed SSE event
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  return {
    ...test,
    ok: res.ok,
    status: res.status,
    elapsed_ms: Date.now() - started,
    content,
    sources,
  };
}

function isoForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const baseUrl = process.env.EVAL_BASE_URL || 'http://localhost:9527';

  const cases: EvalCase[] = [
    {
      id: 'intro-30s',
      mode: 'auto',
      message: 'Give me a 30-second intro. What do you build and why?',
    },
    {
      id: 'skills-evidence',
      mode: 'auto',
      message: 'Which skills best represent you? Keep it concrete.',
    },
    {
      id: 'projects-top',
      mode: 'auto',
      message: 'Give me a quick overview of your strongest projects.',
    },
    {
      id: 'resume-deep-dive',
      mode: 'auto',
      message: 'Walk me through your resume like a recruiter would, in 6 bullets.',
    },
    {
      id: 'behavioral-star',
      mode: 'behavior',
      message: 'Tell me about a time you led something ambiguous. Answer in STAR.',
    },
    {
      id: 'tech-system-design',
      mode: 'tech',
      message:
        'Explain one system you built end-to-end and the hardest trade-off you made. Be specific.',
    },
    {
      id: 'cover-letter',
      mode: 'auto',
      message:
        'Draft a short cover letter for a Software Engineer role. If you need the JD, ask me to paste it.',
    },
  ];

  const started = new Date();
  const results: EvalResult[] = [];

  for (const test of cases) {
    console.log(`Running ${test.id} (${test.mode})...`);
    results.push(await runCase(baseUrl, test));
  }

  const outPath = join(process.cwd(), 'training_runs', `${isoForFilename(started)}_eval.json`);
  await writeFile(
    outPath,
    JSON.stringify(
      {
        baseUrl,
        started_at: started.toISOString(),
        finished_at: new Date().toISOString(),
        results,
      },
      null,
      2
    )
  );

  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
