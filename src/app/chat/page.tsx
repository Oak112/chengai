import ChatInterface from '@/components/chat/ChatInterface';

export const metadata = {
  title: 'Chat with AI | Charlie Cheng',
  description: 'Ask my AI about my projects, skills, and experience',
};

export default function ChatPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const initialMessage = typeof searchParams?.q === 'string' ? searchParams.q : undefined;
  const rawMode = typeof searchParams?.mode === 'string' ? searchParams.mode : undefined;
  const initialMode =
    rawMode === 'auto' || rawMode === 'tech' || rawMode === 'behavior' ? rawMode : undefined;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-zinc-500/10 via-blue-500/10 to-purple-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-[calc(100vh-10rem)]">
          <ChatInterface initialMessage={initialMessage} initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}
