import { NextRequest, NextResponse } from 'next/server';
import { generateText, JD_PARSE_PROMPT } from '@/lib/ai';
import { retrieveContext } from '@/lib/rag';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Project, Skill, Story } from '@/types';
import { extractSkillsFromText } from '@/lib/skills-import';

export const runtime = 'nodejs';

interface JDParseResult {
  required_skills: string[];
  preferred_skills: string[];
  years_experience: number | null;
  responsibilities: string[];
  soft_skills: string[];
  keywords: string[];
}

const JD_SOURCE_TYPES = ['resume', 'experience', 'project', 'story', 'skill'] as const;

const LANGUAGE_TOKENS = new Set<string>([
  'python',
  'java',
  'javascript',
  'typescript',
  'go',
  'ruby',
  'scala',
  'kotlin',
  'swift',
  'rust',
  'php',
  'cplusplus',
  'csharp',
  'sql',
]);

function normalizeToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/c\+\+/g, 'cplusplus')
    .replace(/c#/g, 'csharp')
    .replace(/\.js/g, 'js')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const key = normalizeToken(v);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function isLanguageTerm(term: string): boolean {
  const norm = normalizeToken(term);
  if (!norm) return false;
  // Allow e.g. "JavaScript/TypeScript" -> "javascript typescript"
  const parts = norm.split(' ').filter(Boolean);
  return parts.some((p) => LANGUAGE_TOKENS.has(p));
}

function isGenericRequirement(term: string): boolean {
  const raw = String(term || '').trim();
  const norm = normalizeToken(raw);
  if (!norm) return true;

  // Drop sentences / long phrases from the "skills" lists; those belong in responsibilities/keywords.
  if (norm.split(' ').length > 6) return true;

  const genericPatterns: RegExp[] = [
    /\bprogramming fundamentals\b/i,
    /\bfundamentals\b/i,
    /\bprogramming experience\b/i,
    /\bcomputer science\b/i,
    /\bdata structures?\b/i,
    /\balgorithms?\b/i,
    /\bobject[- ]oriented\b/i,
    /\boop\b/i,
    /\bproblem solving\b/i,
    /\bcommunication\b/i,
    /\bteamwork\b/i,
    /\bcollaboration\b/i,
    /\bapi integration\b/i,
    /\bfull[- ]stack\b/i,
    /\b(frontend|back[- ]?end|backend)\s+technolog/i,
    /\bhttps?\b/i,
    /\blarge volumes? of data\b/i,
  ];

  return genericPatterns.some((re) => re.test(raw));
}

function sanitizeTechRequirements(values: string[]): string[] {
  return dedupeStrings(values).filter((v) => !isGenericRequirement(v));
}

function buildJDQuery(parsed: JDParseResult, jd: string): string {
  const terms = dedupeStrings([
    ...(parsed.required_skills || []),
    ...(parsed.preferred_skills || []),
    ...(parsed.keywords || []),
    ...(parsed.responsibilities || []).slice(0, 12),
    // Also add known skill mentions detected directly from the JD text.
    ...extractSkillsFromText(jd).map((s) => s.name),
  ]);

  // Keep the query compact to improve both FTS and embedding recall.
  const compact = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 60)
    .slice(0, 40)
    .join(' ');

  return compact || jd.slice(0, 800);
}

function matchSkillToTerms(skillName: string, jdTerms: string[], jdRaw: string): string | null {
  const nameNorm = normalizeToken(skillName);
  if (!nameNorm) return null;

  const hay = ` ${normalizeToken(jdRaw)} `;
  if (nameNorm.length >= 3 && hay.includes(` ${nameNorm} `)) return skillName;

  for (const t of jdTerms) {
    const tNorm = normalizeToken(t);
    if (!tNorm) continue;

    // Avoid overly-broad substring matches for tiny tokens (e.g., "go").
    if (nameNorm.length < 3 || tNorm.length < 3) {
      const word = new RegExp(`\\b${skillName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i');
      if (word.test(t)) return t;
      continue;
    }

    if (tNorm.includes(nameNorm) || nameNorm.includes(tNorm)) return t;
  }

  return null;
}

function clampText(value: string, maxChars: number): string {
  const v = String(value || '').trim();
  if (v.length <= maxChars) return v;
  return v.slice(0, maxChars) + '…';
}

function getSourceHref(source: { source_type: string; source_slug?: string | null }): string | null {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chengai-tianle.ai-builders.space').replace(/\/$/, '');
  const toPublicUrl = (path: string) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const type = source.source_type;
  if (type === 'article' && source.source_slug) return toPublicUrl(`/articles/${source.source_slug}`);
  if (type === 'project' && source.source_slug) return toPublicUrl(`/projects/${source.source_slug}`);
  if (type === 'experience') return toPublicUrl('/experience');
  if (type === 'resume') return toPublicUrl('/api/resume');
  if (type === 'story') return toPublicUrl('/stories');
  if (type === 'skill') return toPublicUrl('/skills');
  return null;
}

function buildEvidenceContext(
  chunks: Array<{
    source_type: string;
    source_title: string;
    source_slug?: string | null;
    content_preview: string;
  }>
): string {
  return (chunks || [])
    .map((c) => {
      const url = getSourceHref(c);
      const urlLine = url ? `\nURL: ${url}` : '';
      const slugLine = c.source_slug ? ` (slug: ${c.source_slug})` : '';
      return `Type: ${c.source_type}\nTitle: ${c.source_title}${slugLine}${urlLine}\nSnippet: ${c.content_preview}`;
    })
    .join('\n\n');
}

function buildEvidenceNeedles(requirement: string): string[] {
  const base = normalizeToken(requirement);
  const needles = new Set<string>();

  const add = (value: string) => {
    const norm = normalizeToken(value);
    if (norm) needles.add(norm);
  };

  add(requirement);

  if (/\bllm\b/.test(base) || base.includes('large language model') || base.includes('genai') || base.includes('generative ai')) {
    add('openai');
    add('gpt');
    add('gemini');
    add('claude');
    add('rag');
    add('agent');
    add('agents');
  }

  if (base.includes('prompt')) {
    add('prompt');
    add('prompting');
    add('prompt design');
    add('prompt tuning');
    add('prompt experimentation');
  }

  if (base.includes('rag') || base.includes('retrieval')) {
    add('rag');
    add('retrieval');
    add('vector');
    add('embedding');
    add('embeddings');
    add('bm25');
    add('pgvector');
  }

  if (base.includes('agent')) {
    add('agent');
    add('agents');
    add('agentic');
    add('tool use');
    add('mcp');
  }

  if (base.includes('llamaindex')) {
    // Treat comparable frameworks as evidence of transferable skill.
    add('llamaindex');
    add('langchain');
    add('langgraph');
    add('semantic kernel');
    add('crewai');
    add('agents');
  }

  if (base.includes('langchain') || base.includes('langgraph') || base.includes('semantic kernel') || base.includes('agents sdk') || base.includes('agent sdk')) {
    // Treat adjacent frameworks as interchangeable for early-career roles.
    add('langchain');
    add('langgraph');
    add('semantic kernel');
    add('crewai');
  }

  if (base.includes('evaluation') || base.includes('eval') || base.includes('model evaluation')) {
    add('evaluation');
    add('eval');
    add('accuracy');
    add('latency');
    add('cost');
    add('robust');
    add('monitor');
    add('observability');
  }

  if (base === 'typescript' || base === 'ts') {
    add('typescript');
    add('ts');
  }

  if (base === 'javascript' || base === 'js') {
    add('javascript');
    add('js');
  }

  if (base.includes('ci cd') || base.includes('cicd')) {
    add('ci cd');
    add('cicd');
    add('github actions');
    add('pipeline');
  }

  if (base.includes('docker')) {
    add('docker');
    add('docker compose');
  }

  return Array.from(needles);
}

function includesNeedle(hay: string, needle: string): boolean {
  if (!needle) return false;
  const h = ` ${hay} `;
  const n = ` ${needle} `;
  return h.includes(n);
}

function requirementSatisfied(
  requirement: string,
  matchedSkills: Array<{ skill: Skill; matchedRequirement: string }>,
  evidenceHay: string
): boolean {
  const reqNorm = normalizeToken(requirement);
  if (!reqNorm) return false;

  const direct = matchedSkills.some(({ skill, matchedRequirement }) => {
    const matchedNorm = normalizeToken(matchedRequirement || skill.name);
    if (!matchedNorm) return false;
    if (matchedNorm.length < 3 || reqNorm.length < 3) return matchedNorm === reqNorm;
    return matchedNorm.includes(reqNorm) || reqNorm.includes(matchedNorm);
  });

  if (direct) return true;

  if (!evidenceHay) return false;
  for (const needle of buildEvidenceNeedles(requirement)) {
    if (!needle) continue;
    if (needle.length < 2) continue;
    if (includesNeedle(evidenceHay, needle)) return true;
  }
  return false;
}

function computeCoverage(
  requirements: string[],
  matchedSkills: Array<{ skill: Skill; matchedRequirement: string }>,
  evidenceHay: string
): { total: number; matched: number; gaps: string[] } {
  const languageReqs = requirements.filter(isLanguageTerm);
  const nonLanguageReqs = requirements.filter((r) => !isLanguageTerm(r));

  let total = 0;
  let matched = 0;
  const gaps: string[] = [];

  if (languageReqs.length > 0) {
    total += 1;
    const satisfied = languageReqs.some((req) => requirementSatisfied(req, matchedSkills, evidenceHay));
    if (satisfied) {
      matched += 1;
    } else {
      gaps.push(...languageReqs);
    }
  }

  for (const req of nonLanguageReqs) {
    total += 1;
    if (requirementSatisfied(req, matchedSkills, evidenceHay)) {
      matched += 1;
    } else {
      gaps.push(req);
    }
  }

  return { total, matched, gaps };
}

export async function POST(request: NextRequest) {
  try {
    const { jd } = await request.json();

    if (!jd || typeof jd !== 'string' || jd.length < 50) {
      return NextResponse.json(
        { error: 'Please provide a valid job description (at least 50 characters)' },
        { status: 400 }
      );
    }

    if (jd.length > 10000) {
      return NextResponse.json(
        { error: 'Job description is too long (max 10000 characters)' },
        { status: 400 }
      );
    }

    // Parse JD using AI
    const parseResultRaw = await generateText(JD_PARSE_PROMPT, jd, { temperature: 0 });
    
    // Extract JSON from response
    let parseResult: JDParseResult;
    try {
      parseResult = JSON.parse(parseResultRaw) as JDParseResult;
    } catch {
      try {
        const jsonMatch = parseResultRaw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return NextResponse.json(
            { error: 'Failed to parse job description. Please try with a cleaner JD.' },
            { status: 422 }
          );
        }
        parseResult = JSON.parse(jsonMatch[0]) as JDParseResult;
      } catch {
        return NextResponse.json(
          { error: 'Failed to parse job description structure' },
          { status: 422 }
        );
      }
    }

    const requiredRaw = Array.isArray(parseResult.required_skills) ? parseResult.required_skills : [];
    const preferredRaw = Array.isArray(parseResult.preferred_skills) ? parseResult.preferred_skills : [];
    const keywords = Array.isArray(parseResult.keywords) ? parseResult.keywords : [];
    const responsibilities = Array.isArray(parseResult.responsibilities) ? parseResult.responsibilities : [];

    const required = sanitizeTechRequirements(requiredRaw);
    const preferred = sanitizeTechRequirements(preferredRaw);

    const allKeywords = dedupeStrings([...required, ...preferred, ...keywords]);

    // Build a compact query and retrieve evidence from the same RAG system used by chat.
    const query = buildJDQuery(
      {
        ...parseResult,
        required_skills: required,
        preferred_skills: preferred,
        keywords,
        responsibilities,
      },
      jd
    );

    const retrieval = await retrieveContext(query, 16, [...JD_SOURCE_TYPES]);
    const matchedChunks = retrieval.chunks || [];
    const evidenceContext = buildEvidenceContext(matchedChunks);
    const evidenceHay = normalizeToken(evidenceContext);

    // Get user's skills
    const { data: skills } = await supabase
      .from('skills')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID);

    // Get relevant projects
    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('status', 'published');

    // Get stories for behavioral evidence
    const { data: stories } = await supabase
      .from('stories')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .eq('is_public', true);

    // Determine matched skills using better normalization and direct JD text scanning.
    const jdTerms = dedupeStrings([...required, ...preferred, ...keywords]);
    const skillsData = (skills || []) as Skill[];
    const matchedSkills = skillsData.flatMap((skill) => {
      const matchedRequirement =
        matchSkillToTerms(skill.name, required, jd) ||
        matchSkillToTerms(skill.name, preferred, jd) ||
        matchSkillToTerms(skill.name, keywords, jd) ||
        matchSkillToTerms(skill.name, jdTerms, jd);
      return matchedRequirement ? [{ skill, matchedRequirement }] : [];
    });

    // Calculate match score
    const requiredCoverage = computeCoverage(required, matchedSkills, evidenceHay);
    const preferredCoverage = computeCoverage(preferred, matchedSkills, evidenceHay);

    const isEntryLevel = /\bnew\s*grad(uate)?\b|\bearly[- ]career\b|\bentry[- ]level\b|\bjunior\b/i.test(jd);
    const requiredWeight = 2;
    const preferredWeight = isEntryLevel ? 0.5 : 1;

    const denom = requiredCoverage.total * requiredWeight + preferredCoverage.total * preferredWeight;
    const numer = requiredCoverage.matched * requiredWeight + preferredCoverage.matched * preferredWeight;
    const matchScore = denom === 0 ? 50 : Math.min(100, Math.round((numer / denom) * 100));

    // Find gaps (always include required gaps; include a few preferred gaps as "risks")
    const preferredGaps = preferredCoverage.gaps.filter(
      (g) => !requiredCoverage.gaps.includes(g)
    );
    const gaps = [...requiredCoverage.gaps, ...preferredGaps.slice(0, 8)];

    // Suggest stories based on keyword overlap
    const suggested_stories = (stories as Story[] | null | undefined)
      ? [...(stories as Story[])].sort((a, b) => scoreStory(b, allKeywords) - scoreStory(a, allKeywords)).slice(0, 3)
      : [];

    // Rank projects by RAG evidence first (project chunks), then by keyword overlap as fallback.
    const projectScoreById = new Map<string, number>();
    for (const chunk of matchedChunks) {
      if (chunk.source_type !== 'project') continue;
      const id = typeof chunk.source_id === 'string' ? chunk.source_id : null;
      if (!id) continue;
      const score = Number(chunk.relevance_score) || 0;
      const prev = projectScoreById.get(id) || 0;
      if (score > prev) projectScoreById.set(id, score);
    }

    const keywordNorms = new Set(allKeywords.map((k) => normalizeToken(k)).filter(Boolean));

    const projectsData = (projects || []) as Project[];
    const scoredProjects = projectsData.map((p) => {
      const ragScore = projectScoreById.get(p.id) || 0;
      const hay = normalizeToken(`${p.title}\n${p.subtitle || ''}\n${p.description || ''}\n${(p.tech_stack || []).join(' ')}`);
      let overlap = 0;
      for (const k of keywordNorms) {
        if (!k || k.length < 3) continue;
        if (hay.includes(k)) overlap += 1;
      }
      return { project: p, score: ragScore * 10 + overlap };
    });

    const relevant_projects = scoredProjects
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.project);

    // Generate a persuasive, evidence-backed match report using the retrieved context.
    const parsedJDJson = JSON.stringify(
      {
        ...parseResult,
        required_skills: required,
        preferred_skills: preferred,
        keywords,
        responsibilities,
      },
      null,
      2
    );

    const reportPrompt = `You are a senior technical recruiter and hiring manager.\n\nYou are writing a JD match report for the candidate:\n- Name: Charlie Cheng\n- Website: https://chengai-tianle.ai-builders.space/\n\nHard requirements:\n- English only.\n- Use the canonical name \"Charlie Cheng\" (never older variants).\n- Evidence-first: ONLY use facts that appear in the SOURCES section. Do not invent skills, companies, dates, metrics, visas, or claims.\n- If you mention a metric, copy it exactly as written in SOURCES.\n- Be useful even when evidence is sparse: if something isn't supported, say it's not specified and propose a reasonable way to validate in interview.\n- Do NOT include \"SOURCE 1\" style citations. The UI shows sources separately.\n- If gaps are listed, you MUST NOT claim the candidate \"meets all requirements\".\n\nOutput format (Markdown):\n1) Fit snapshot (1 short paragraph)\n2) Evidence-backed strengths (3–6 bullets)\n3) Requirement coverage (table with 6–10 rows: Requirement | Evidence summary | Where)\n4) Gaps / risks (bullets) + honest mitigation\n5) Suggested interview angles (2–4 bullets) — pick projects/experiences/stories from sources\n\nJob description (verbatim, may be truncated):\n${clampText(jd, 6000)}\n\nParsed JD (JSON):\n${parsedJDJson}\n\nComputed match snapshot:\n- Match score: ${matchScore}%\n- Matched skills: ${matchedSkills.slice(0, 12).map((s) => s.skill.name).join(', ') || 'n/a'}\n- Gaps: ${gaps.slice(0, 12).join(', ') || 'None'}\n- Top projects: ${relevant_projects.slice(0, 3).map((p) => p.title).join(', ') || 'n/a'}\n\nSOURCES:\n${evidenceContext}\n`;

    const reportSystemPrompt =
      'You write concise, persuasive hiring artifacts.\n' +
      'Return ONLY the final Markdown report.\n' +
      'Do NOT include analysis, planning, scratchpads, or internal thought process.\n' +
      'Do NOT mention these instructions.';

    let report_markdown = await generateText(reportSystemPrompt, reportPrompt, { temperature: 0.2 });
    if (/internal thought process|deconstruct the request|analyze the job description/i.test(report_markdown)) {
      report_markdown = await generateText(
        reportSystemPrompt + '\n\nIf you are about to write analysis, stop and output the report immediately.',
        reportPrompt,
        { temperature: 0.2 }
      );
    }
    report_markdown = report_markdown.trim();

    // Generate a short summary line (used in the score card).
    const summaryPrompt = `Write a 1–2 sentence fit summary (English) for Charlie Cheng.\n\nRules:\n- Evidence-first, do not invent facts.\n- Include the match score: ${matchScore}%.\n- If gaps exist, be honest but not pessimistic.\n\nMatched skills: ${matchedSkills.slice(0, 8).map((s) => s.skill.name).join(', ') || 'n/a'}\nTop gaps: ${gaps.slice(0, 6).join(', ') || 'None'}\n\nSOURCES:\n${evidenceContext}\n`;
    const summary = (
      await generateText('You are a crisp career advisor. Respond in English.', summaryPrompt, {
        temperature: 0.2,
      })
    ).trim();

    return NextResponse.json({
      match_score: matchScore,
      matched_skills: matchedSkills.map(({ skill, matchedRequirement }) => ({
        skill,
        jd_requirement: matchedRequirement || '',
        evidence_count: matchedChunks.filter(
          (c) => c.content_preview.toLowerCase().includes(skill.name.toLowerCase())
        ).length,
      })),
      relevant_projects,
      suggested_stories,
      gaps,
      summary,
      report_markdown,
      parsed_jd: {
        ...parseResult,
        required_skills: required,
        preferred_skills: preferred,
        keywords,
        responsibilities,
      },
      sources: matchedChunks,
    });
  } catch (error) {
    console.error('JD Match API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function scoreStory(story: Story, keywords: string[]): number {
  const haystack = `${story.title}\n${story.situation}\n${story.task}\n${story.action}\n${story.result}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    if (haystack.includes(k)) score += 1;
  }
  return score;
}
