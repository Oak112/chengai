export type SiteSettings = {
  profile: {
    displayName: string;
    heroSubtitle: string;
    education: string;
    availability: string;
    email: string;
    linkedinLabel: string;
    linkedinUrl: string;
    githubLabel: string;
    githubUrl: string;
  };
  resume: {
    title: string;
    subtitle: string;
  };
  visibility: {
    identityBar: boolean;
    education: boolean;
    availability: boolean;
    email: boolean;
    linkedin: boolean;
    github: boolean;
    chatCta: boolean;
    jdMatchCta: boolean;
    resumeCard: boolean;
    resumePreview: boolean;
    resumeExpand: boolean;
    resumeDownload: boolean;
    shortcuts: boolean;
    exploreWork: boolean;
    experienceNav: boolean;
    projectsNav: boolean;
    skillsNav: boolean;
    articlesNav: boolean;
    storiesNav: boolean;
    chatNav: boolean;
  };
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  profile: {
    displayName: 'Charlie Cheng',
    heroSubtitle:
      'AI-native student and engineer building powerful AI products. Chat with my AI twin, match a job description, or run a mock interview.',
    education: 'NYU (M.S.), Graduate at May 2026',
    availability: 'Actively seeking full-time Software, AI, or ML Engineer roles',
    email: 'charliecheng112@gmail.com',
    linkedinLabel: 'LinkedIn',
    linkedinUrl: 'https://www.linkedin.com/in/charlie-tianle-cheng-6147a4325',
    githubLabel: 'GitHub',
    githubUrl: 'https://github.com/Oak112',
  },
  resume: {
    title: 'Resume',
    subtitle: 'Scroll to preview. Expand for full view.',
  },
  visibility: {
    identityBar: true,
    education: true,
    availability: true,
    email: true,
    linkedin: true,
    github: true,
    chatCta: true,
    jdMatchCta: true,
    resumeCard: true,
    resumePreview: true,
    resumeExpand: true,
    resumeDownload: true,
    shortcuts: true,
    exploreWork: true,
    experienceNav: true,
    projectsNav: true,
    skillsNav: true,
    articlesNav: true,
    storiesNav: true,
    chatNav: true,
  },
};

const MAX_LENGTHS: Record<string, number> = {
  displayName: 80,
  heroSubtitle: 240,
  education: 120,
  availability: 160,
  email: 120,
  linkedinLabel: 40,
  linkedinUrl: 220,
  githubLabel: 40,
  githubUrl: 220,
  title: 80,
  subtitle: 140,
};

function cleanString(value: unknown, fallback: string, key: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const max = MAX_LENGTHS[key] || 160;
  return normalized.slice(0, max);
}

function cleanUrl(value: unknown, fallback: string): string {
  const text = cleanString(value, fallback, 'githubUrl');
  if (!/^https?:\/\//i.test(text)) return fallback;
  return text;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function mergeSiteSettings(input: unknown): SiteSettings {
  const raw = input && typeof input === 'object' ? (input as Partial<SiteSettings>) : {};
  const rawProfile: Partial<SiteSettings['profile']> =
    raw.profile && typeof raw.profile === 'object' ? raw.profile : {};
  const rawResume: Partial<SiteSettings['resume']> =
    raw.resume && typeof raw.resume === 'object' ? raw.resume : {};
  const rawVisibility: Partial<SiteSettings['visibility']> =
    raw.visibility && typeof raw.visibility === 'object' ? raw.visibility : {};

  const defaults = DEFAULT_SITE_SETTINGS;

  const settings: SiteSettings = {
    profile: {
      displayName: cleanString(rawProfile.displayName, defaults.profile.displayName, 'displayName'),
      heroSubtitle: cleanString(rawProfile.heroSubtitle, defaults.profile.heroSubtitle, 'heroSubtitle'),
      education: cleanString(rawProfile.education, defaults.profile.education, 'education'),
      availability: cleanString(rawProfile.availability, defaults.profile.availability, 'availability'),
      email: cleanString(rawProfile.email, defaults.profile.email, 'email'),
      linkedinLabel: cleanString(rawProfile.linkedinLabel, defaults.profile.linkedinLabel, 'linkedinLabel'),
      linkedinUrl: cleanUrl(rawProfile.linkedinUrl, defaults.profile.linkedinUrl),
      githubLabel: cleanString(rawProfile.githubLabel, defaults.profile.githubLabel, 'githubLabel'),
      githubUrl: cleanUrl(rawProfile.githubUrl, defaults.profile.githubUrl),
    },
    resume: {
      title: cleanString(rawResume.title, defaults.resume.title, 'title'),
      subtitle: cleanString(rawResume.subtitle, defaults.resume.subtitle, 'subtitle'),
    },
    visibility: {
      identityBar: cleanBoolean(rawVisibility.identityBar, defaults.visibility.identityBar),
      education: cleanBoolean(rawVisibility.education, defaults.visibility.education),
      availability: cleanBoolean(rawVisibility.availability, defaults.visibility.availability),
      email: cleanBoolean(rawVisibility.email, defaults.visibility.email),
      linkedin: cleanBoolean(rawVisibility.linkedin, defaults.visibility.linkedin),
      github: cleanBoolean(rawVisibility.github, defaults.visibility.github),
      chatCta: cleanBoolean(rawVisibility.chatCta, defaults.visibility.chatCta),
      jdMatchCta: cleanBoolean(rawVisibility.jdMatchCta, defaults.visibility.jdMatchCta),
      resumeCard: cleanBoolean(rawVisibility.resumeCard, defaults.visibility.resumeCard),
      resumePreview: cleanBoolean(rawVisibility.resumePreview, defaults.visibility.resumePreview),
      resumeExpand: cleanBoolean(rawVisibility.resumeExpand, defaults.visibility.resumeExpand),
      resumeDownload: cleanBoolean(rawVisibility.resumeDownload, defaults.visibility.resumeDownload),
      shortcuts: cleanBoolean(rawVisibility.shortcuts, defaults.visibility.shortcuts),
      exploreWork: cleanBoolean(rawVisibility.exploreWork, defaults.visibility.exploreWork),
      experienceNav: cleanBoolean(rawVisibility.experienceNav, defaults.visibility.experienceNav),
      projectsNav: cleanBoolean(rawVisibility.projectsNav, defaults.visibility.projectsNav),
      skillsNav: cleanBoolean(rawVisibility.skillsNav, defaults.visibility.skillsNav),
      articlesNav: cleanBoolean(rawVisibility.articlesNav, defaults.visibility.articlesNav),
      storiesNav: cleanBoolean(rawVisibility.storiesNav, defaults.visibility.storiesNav),
      chatNav: cleanBoolean(rawVisibility.chatNav, defaults.visibility.chatNav),
    },
  };

  if (!settings.visibility.identityBar) {
    settings.visibility.education = false;
    settings.visibility.availability = false;
    settings.visibility.email = false;
    settings.visibility.linkedin = false;
    settings.visibility.github = false;
  }

  if (!settings.visibility.resumeCard) {
    settings.visibility.resumePreview = false;
    settings.visibility.resumeExpand = false;
    settings.visibility.resumeDownload = false;
  }

  return settings;
}

export function buildSettingsIdentityPrompt(settings: SiteSettings): string {
  const hidden: string[] = [];
  if (!settings.visibility.email) hidden.push('email');
  if (!settings.visibility.linkedin) hidden.push('LinkedIn');
  if (!settings.visibility.github) hidden.push('GitHub');
  if (!settings.visibility.resumeCard) hidden.push('resume');

  return [
    '## Current admin-managed public profile',
    `Display name: ${settings.profile.displayName}`,
    `Program: ${settings.profile.education}`,
    `Availability: ${settings.profile.availability}`,
    `Email: ${settings.profile.email}`,
    `LinkedIn: ${settings.profile.linkedinUrl}`,
    `GitHub: ${settings.profile.githubUrl}`,
    hidden.length > 0
      ? `Hidden from public homepage: ${hidden.join(', ')}. Do not proactively surface hidden fields unless the user directly asks for that specific contact or resume item.`
      : 'No contact or resume fields are hidden on the homepage.',
  ].join('\n');
}
