'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader2, User, Bot, BookOpen, Sparkles, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import type { ChatMessage, ChunkReference } from '@/types';

interface ChatInterfaceProps {
  initialMessage?: string;
  initialMode?: 'auto' | 'tech' | 'behavior';
}

function dedupeSources(sources: ChunkReference[]): ChunkReference[] {
  const out: ChunkReference[] = [];
  const seen = new Set<string>();

  for (const s of sources || []) {
    const slugOrTitle = s.source_slug || s.source_title || s.source_id || '';
    const key = `${s.source_type || 'unknown'}:${slugOrTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}

function getSourceHref(source: ChunkReference): string | null {
  const type = source.source_type;
  if (type === 'article' && source.source_slug) return `/articles/${source.source_slug}`;
  if (type === 'project' && source.source_slug) return `/projects/${source.source_slug}`;
  if (type === 'experience') return '/experience';
  if (type === 'resume') return '/api/resume';
  if (type === 'story') return '/stories';
  if (type === 'skill') return '/skills';
  return null;
}

function trackEvent(type: string, meta?: Record<string, unknown>) {
  try {
    void fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, meta: meta || {} }),
    });
  } catch {
    // ignore
  }
}

export default function ChatInterface({ initialMessage, initialMode }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialMessage || '');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'auto' | 'tech' | 'behavior'>(initialMode || 'auto');
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const suggestedPrompts = useMemo(
    () => [
      'Give me a 30-second intro — who are you and what do you build?',
      'Which skills best represent you? Keep it concrete.',
      'Interview question: Tell me about a challenging project and your trade-offs.',
      'Paste a JD and match it to your profile.',
    ],
    []
  );

  // Load persisted chat history
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chengai_chat_v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        messages?: ChatMessage[];
        mode?: 'auto' | 'tech' | 'behavior';
      };
      if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
      if (!initialMode && (parsed.mode === 'auto' || parsed.mode === 'tech' || parsed.mode === 'behavior')) {
        setMode(parsed.mode);
      }
    } catch {
      // ignore
    }
  }, [initialMode]);

  // Persist chat history
  useEffect(() => {
    if (isLoading) return;
    try {
      localStorage.setItem('chengai_chat_v1', JSON.stringify({ messages, mode }));
    } catch {
      // ignore
    }
  }, [messages, mode, isLoading]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const id = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 160;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    autoScrollRef.current = true;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    const assistantId = (Date.now() + 1).toString();
    setActiveAssistantId(assistantId);
    if (messages.length === 0) {
      trackEvent('chat_started', { mode });
    }
    trackEvent('chat_message_sent', { mode });

    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages.slice(-4),
          mode,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';

        for (const event of events) {
          const dataLines = event
            .split('\n')
            .filter((line) => line.startsWith('data: '));
          if (dataLines.length === 0) continue;

          const data = dataLines.map((l) => l.slice(6)).join('\n');
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'sources' && Array.isArray(parsed.sources)) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, sources: parsed.sources as ChunkReference[] }
                    : m
                )
              );
            } else if (parsed.type === 'replace' && typeof parsed.content === 'string') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: parsed.content } : m))
              );
            } else if (parsed.type === 'text' && typeof parsed.content === 'string') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: `${m.content || ''}${parsed.content}` }
                    : m
                )
              );
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = 'Sorry, something went wrong. Please try again.';
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      setActiveAssistantId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (isLoading) return;
    setMessages([]);
    setInput('');
    try {
      localStorage.removeItem('chengai_chat_v1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white/70 shadow-xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/60">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200/70 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-sm">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">
              Charlie&apos;s AI
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Evidence-first • RAG-powered • {mode === 'auto' ? 'Auto' : mode}
            </div>
          </div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="ml-2 rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-950"
            disabled={isLoading}
            aria-label="Mode"
          >
            <option value="auto">Auto</option>
            <option value="tech">Tech deep dive</option>
            <option value="behavior">Behavioral (STAR)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            disabled={isLoading || messages.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-white disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-950"
          >
            <Trash2 className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>
      </div>
      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 to-purple-600/15 text-zinc-700 dark:text-zinc-200">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Ask anything about Charlie
          </h3>
          <p className="mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              I&apos;ll answer based on my projects, resume, and writing — with sources shown below each answer.
          </p>

            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInput(p)}
                  className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200 dark:hover:bg-zinc-950"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
          >
            {message.role === 'assistant' && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-sm">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                message.role === 'user'
                  ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white'
                  : 'border border-zinc-200/70 bg-white/80 text-zinc-900 dark:border-zinc-800/70 dark:bg-zinc-950/50 dark:text-white'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
                  {message.content ? (
                    isLoading && activeAssistantId === message.id ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.content}
                      </div>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    )
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500" />
                      <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms] dark:bg-zinc-500" />
                      <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms] dark:bg-zinc-500" />
                    </div>
                  )}

                  {message.sources && message.sources.length > 0 && (() => {
                    const uniqueSources = dedupeSources(message.sources);
                    return (
                      <div className="not-prose mt-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-800/70">
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          <BookOpen className="h-3 w-3" />
                          <span>Sources</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {uniqueSources.slice(0, 6).map((s) => {
                            const href = getSourceHref(s);
                            const commonClass =
                              'inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200 dark:hover:bg-zinc-950';

                            return href ? (
                              <Link
                                key={s.chunk_id}
                                href={href}
                                className={commonClass}
                                title={s.content_preview}
                              >
                                {s.source_title}
                              </Link>
                            ) : (
                              <span key={s.chunk_id} className={commonClass} title={s.content_preview}>
                                {s.source_title}
                              </span>
                            );
                          })}
                          {uniqueSources.length > 6 && (
                            <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
                              +{uniqueSources.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm">{message.content}</p>
              )}
            </div>
            {message.role === 'user' && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-zinc-200 dark:bg-zinc-800">
                <User className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Input */}
      <div className="border-t border-zinc-200/70 bg-white/60 p-4 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/40">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything…"
            className="flex-1 resize-none rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-white dark:placeholder:text-zinc-500"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            aria-label="Send"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
