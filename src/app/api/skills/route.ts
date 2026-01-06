import { NextResponse } from 'next/server';
import { supabase, DEFAULT_OWNER_ID } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Get skills
    const { data: skills, error } = await supabase
      .from('skills')
      .select('*')
      .eq('owner_id', DEFAULT_OWNER_ID)
      .order('is_primary', { ascending: false })
      .order('proficiency', { ascending: false });

    if (error) throw error;

    // Group by category
    const groupedSkills = skills?.reduce(
      (acc, skill) => {
        const category = skill.category || 'other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(skill);
        return acc;
      },
      {} as Record<string, typeof skills>
    );

    return NextResponse.json({
      skills: skills || [],
      grouped: groupedSkills || {},
    });
  } catch (error) {
    console.error('Skills API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

