import JDMatcher from '@/components/chat/JDMatcher';

export const metadata = {
  title: 'JD Match | Tianle Cheng',
  description: 'See how my skills and experience match your job requirements',
};

export default function JDMatchPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
          Job Description Match
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Paste a job description to see how my skills and experience align with the requirements.
        </p>
      </div>
      <JDMatcher />
    </div>
  );
}

