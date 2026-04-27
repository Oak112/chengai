import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSiteSettingsUncached, saveSiteSettings } from '@/lib/site-settings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = await getSiteSettingsUncached();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Admin site settings GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load site settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = await saveSiteSettings(body);

    revalidatePath('/', 'layout');
    revalidatePath('/');

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Admin site settings PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save site settings' },
      { status: 500 }
    );
  }
}
