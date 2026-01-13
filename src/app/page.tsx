import { MessageSquare, Briefcase, ArrowRight, Code, FileText, Download, Building2 } from "lucide-react";
import ResumeDownloadLink from "@/components/ResumeDownloadLink";
import TrackedLink from "@/components/TrackedLink";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* Avatar */}
            <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-4xl font-bold text-white shadow-lg">
              CC
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
              Hi, I&apos;m{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                Charlie Cheng
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Full-stack developer building evidence-first AI products and polished web experiences.
              Chat with my AI twin, match a job description, or run a mock interview.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <TrackedLink
                href="/chat"
                event="cta_click"
                meta={{ cta: "chat_with_ai", page: "home" }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-medium text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl"
              >
                <MessageSquare className="h-5 w-5" />
                Chat with My AI
                <ArrowRight className="h-4 w-4" />
              </TrackedLink>
              <TrackedLink
                href="/jd-match"
                event="cta_click"
                meta={{ cta: "jd_match", page: "home" }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-200 bg-white px-8 py-4 text-lg font-medium text-zinc-700 transition-colors hover:border-blue-600 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
              >
                <Briefcase className="h-5 w-5" />
                Match Your JD
              </TrackedLink>
            </div>

            {/* Resume Download */}
            <div className="mt-6">
              <ResumeDownloadLink
                className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                <Download className="h-4 w-4" />
                Download My Resume (PDF)
              </ResumeDownloadLink>
            </div>

            {/* Playful shortcuts */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <TrackedLink
                href={{
                  pathname: '/chat',
                  query: { q: 'Give me a 30-second intro, then list your strongest projects.' },
                }}
                event="shortcut_click"
                meta={{ shortcut: 'intro', page: 'home' }}
                className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                30-sec intro
              </TrackedLink>
              <TrackedLink
                href={{
                  pathname: '/chat',
                  query: {
                    q: 'Mock interview (technical): answer like a candidate, then ask me one follow-up question.',
                    mode: 'tech',
                  },
                }}
                event="shortcut_click"
                meta={{ shortcut: 'mock_interview_tech', page: 'home' }}
                className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                Mock interview (tech)
              </TrackedLink>
              <TrackedLink
                href={{
                  pathname: '/chat',
                  query: {
                    q: 'Mock interview (behavioral): answer in STAR, then ask me one follow-up question.',
                    mode: 'behavior',
                  },
                }}
                event="shortcut_click"
                meta={{ shortcut: 'mock_interview_star', page: 'home' }}
                className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                Mock interview (STAR)
              </TrackedLink>
              <TrackedLink
                href={{
                  pathname: '/chat',
                  query: {
                    q: 'Write a concise referral message + cover letter. Ask me to paste the JD if needed.',
                  },
                }}
                event="shortcut_click"
                meta={{ shortcut: 'referral_cover_letter', page: 'home' }}
                className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                Referral + cover letter
              </TrackedLink>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-zinc-900 dark:text-white mb-12">
            Explore My Work
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Experience Card */}
            <TrackedLink
              href="/experience"
              event="home_card_click"
              meta={{ card: "experience" }}
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-teal-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Building2 className="h-8 w-8 text-teal-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-teal-600">
                Experience
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                A quick read on roles, impact, and what I shipped.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-600">
                View Experience <ArrowRight className="h-4 w-4" />
              </span>
            </TrackedLink>

            {/* Projects Card */}
            <TrackedLink
              href="/projects"
              event="home_card_click"
              meta={{ card: "projects" }}
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-blue-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Code className="h-8 w-8 text-blue-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-blue-600">
                Projects
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Explore my portfolio of AI-powered applications and full-stack projects.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                View Projects <ArrowRight className="h-4 w-4" />
              </span>
            </TrackedLink>

            {/* Skills Card */}
            <TrackedLink
              href="/skills"
              event="home_card_click"
              meta={{ card: "skills" }}
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-purple-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Briefcase className="h-8 w-8 text-purple-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-purple-600">
                Skills
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Technical skills with evidence from real projects and experience.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-purple-600">
                View Skills <ArrowRight className="h-4 w-4" />
              </span>
            </TrackedLink>

            {/* Articles Card */}
            <TrackedLink
              href="/articles"
              event="home_card_click"
              meta={{ card: "articles" }}
              className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-green-500 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <FileText className="h-8 w-8 text-green-600 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-green-600">
                Articles
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Thoughts on AI, software development, and building products.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-green-600">
                Read Articles <ArrowRight className="h-4 w-4" />
              </span>
            </TrackedLink>
          </div>
        </div>
      </section>
    </div>
  );
}
