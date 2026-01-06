import { NextRequest, NextResponse } from 'next/server';
import { generateText, JD_PARSE_PROMPT } from '@/lib/ai';
import { matchJDToSkills } from '@/lib/rag';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';
import type { Story } from '@/types';

export const runtime = 'nodejs';

interface JDParseResult {
  required_skills: string[];
  preferred_skills: string[];
  years_experience: number | null;
  responsibilities: string[];
  soft_skills: string[];
  keywords: string[];
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
    const parseResultRaw = await generateText(JD_PARSE_PROMPT, jd);
    
    // Extract JSON from response
    let parseResult: JDParseResult;
    try {
      const jsonMatch = parseResultRaw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: 'Failed to parse job description. Please try with a cleaner JD.' },
          { status: 422 }
        );
      }
      parseResult = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse job description structure' },
        { status: 422 }
      );
    }

    // Get all keywords for matching
    const allKeywords = [
      ...parseResult.required_skills,
      ...parseResult.preferred_skills,
      ...parseResult.keywords,
    ];

    // Find matching content
    const matchedChunks = await matchJDToSkills(allKeywords);

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

    // Calculate match score
    const matchedSkills = skills?.filter((skill) =>
      allKeywords.some(
        (kw) =>
          skill.name.toLowerCase().includes(kw.toLowerCase()) ||
          kw.toLowerCase().includes(skill.name.toLowerCase())
      )
    ) || [];

    const matchScore = Math.min(
      100,
      Math.round(
        (matchedSkills.length / Math.max(1, parseResult.required_skills.length)) * 100
      )
    );

    // Find gaps
    const matchedSkillNames = matchedSkills.map((s) => s.name.toLowerCase());
    const gaps = parseResult.required_skills.filter(
      (skill) =>
        !matchedSkillNames.some(
          (name) =>
            name.includes(skill.toLowerCase()) ||
            skill.toLowerCase().includes(name)
        )
    );

    // Suggest stories based on keyword overlap
    const suggested_stories = (stories as Story[] | null | undefined)
      ? [...(stories as Story[])].sort((a, b) => scoreStory(b, allKeywords) - scoreStory(a, allKeywords)).slice(0, 3)
      : [];

    // Generate summary using AI
    const summaryPrompt = `Based on the job requirements and the candidate's profile, provide a brief 2-3 sentence summary of the match quality. Be professional and constructive.

Job requires: ${parseResult.required_skills.join(', ')}
Candidate has: ${matchedSkillNames.join(', ')}
Match score: ${matchScore}%
Gaps: ${gaps.join(', ') || 'None'}`;

    const summary = await generateText(
      'You are a professional career advisor. Respond in English.',
      summaryPrompt
    );

    return NextResponse.json({
      match_score: matchScore,
      matched_skills: matchedSkills.map((skill) => ({
        skill,
        jd_requirement: parseResult.required_skills.find(
          (r) =>
            r.toLowerCase().includes(skill.name.toLowerCase()) ||
            skill.name.toLowerCase().includes(r.toLowerCase())
        ) || '',
        evidence_count: matchedChunks.filter(
          (c) => c.content_preview.toLowerCase().includes(skill.name.toLowerCase())
        ).length,
      })),
      relevant_projects: projects?.slice(0, 5) || [],
      suggested_stories,
      gaps,
      summary,
      parsed_jd: parseResult,
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
