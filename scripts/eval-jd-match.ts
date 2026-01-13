import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

type GreenhouseJobRef = {
  id: string;
  board: string;
  job_id: string;
};

type GreenhouseJobDetails = {
  id: number;
  title: string;
  location?: { name?: string };
  content?: string;
};

type EvalResult = {
  id: string;
  jd_url: string;
  job_title: string;
  location: string;
  jd_hash: string;
  jd_chars: number;
  ok: boolean;
  status: number;
  elapsed_ms: number;
  match_score?: number;
  matched_skills_count?: number;
  gaps_top?: string[];
  sources_count?: number;
  summary?: string;
  report_markdown?: string;
  error?: string;
};

function isoForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&apos;', "'");
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\/\s*h[1-6]\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n');

  const stripped = withBreaks.replace(/<[^>]*>/g, ' ');
  const decoded = decodeHtmlEntities(stripped);

  return decoded
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchGreenhouseJob(job: GreenhouseJobRef): Promise<{
  jd_url: string;
  job_title: string;
  location: string;
  jd_text: string;
}> {
  const jd_url = `https://boards-api.greenhouse.io/v1/boards/${job.board}/jobs/${job.job_id}?content=true`;
  const res = await fetch(jd_url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JD: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GreenhouseJobDetails;
  const job_title = data.title || `${job.board} job ${job.job_id}`;
  const location = data.location?.name || 'Unknown';
  const contentHtml = data.content || '';
  const jd_text = htmlToText(contentHtml);
  return { jd_url, job_title, location, jd_text };
}

async function runCase(baseUrl: string, job: GreenhouseJobRef): Promise<EvalResult> {
  const started = Date.now();
  try {
    const details = await fetchGreenhouseJob(job);
    const jd_hash = createHash('sha256').update(details.jd_text).digest('hex').slice(0, 16);

    const res = await fetch(`${baseUrl}/api/jd-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd: details.jd_text }),
    });

    const elapsed_ms = Date.now() - started;
    const payload = (await res.json()) as Record<string, unknown>;

    return {
      id: job.id,
      jd_url: details.jd_url,
      job_title: details.job_title,
      location: details.location,
      jd_hash,
      jd_chars: details.jd_text.length,
      ok: res.ok,
      status: res.status,
      elapsed_ms,
      match_score: typeof payload.match_score === 'number' ? payload.match_score : undefined,
      matched_skills_count: Array.isArray(payload.matched_skills) ? payload.matched_skills.length : undefined,
      gaps_top: Array.isArray(payload.gaps) ? (payload.gaps as unknown[]).slice(0, 10).map(String) : undefined,
      sources_count: Array.isArray(payload.sources) ? payload.sources.length : undefined,
      summary: typeof payload.summary === 'string' ? payload.summary : undefined,
      report_markdown: typeof payload.report_markdown === 'string' ? payload.report_markdown : undefined,
      error: !res.ok ? String(payload.error || 'Request failed') : undefined,
    };
  } catch (error) {
    return {
      id: job.id,
      jd_url: '',
      job_title: '',
      location: '',
      jd_hash: '',
      jd_chars: 0,
      ok: false,
      status: 0,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const baseUrl = process.env.EVAL_BASE_URL || 'http://localhost:9527';

  const jobs: GreenhouseJobRef[] = [
    { id: 'stripe-swe-new-grad', board: 'stripe', job_id: '7176977' },
    { id: 'scaleai-swe-new-grad', board: 'scaleai', job_id: '4605996005' },
    { id: 'databricks-swe-new-grad', board: 'databricks', job_id: '6886281002' },
    { id: 'stripe-security-new-grad', board: 'stripe', job_id: '7477571' },
  ];

  const requestedIds = (process.env.EVAL_JD_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const jobsToRun =
    requestedIds.length > 0
      ? jobs.filter((j) => requestedIds.includes(j.id))
      : jobs;

  const started = new Date();
  const results: EvalResult[] = [];

  for (const job of jobsToRun) {
    console.log(`Running ${job.id}...`);
    results.push(await runCase(baseUrl, job));
  }

  const outPath = join(process.cwd(), 'training_runs', `${isoForFilename(started)}_jd_match_eval.json`);
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
