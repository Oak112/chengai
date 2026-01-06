'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Database, FileText, Loader2, CheckCircle, AlertCircle, Trash2, X } from 'lucide-react';

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split('; ').map((c) => c.split('='));
  const match = parts.find(([k]) => k === name);
  return match ? decodeURIComponent(match[1] || '') : null;
}

interface KnowledgeFile {
  name: string;
  chunks: number;
  type: string;
  source_id: string;
  created_at: string;
}

interface KnowledgeStats {
  total: number;
  byType: {
    article: number;
    project: number;
    resume: number;
    story: number;
    skill: number;
  };
}

export default function AdminKnowledgePage() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sourceType, setSourceType] = useState('article');
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isTextIngesting, setIsTextIngesting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/knowledge');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setFiles(data.files);
      }
    } catch (error) {
      console.error('Failed to fetch knowledge data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadStatus(null);
    setUploadProgress(`Processing ${file.name}...`);

    try {
      const csrfToken = getCookieValue('chengai_csrf');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceType', sourceType);

      const res = await fetch('/api/admin/knowledge/upload', {
        method: 'POST',
        body: formData,
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadStatus({
          type: 'success',
          message: `Uploaded ${data.fileName}: ${data.inserted} chunks`,
        });
        fetchData();
      } else {
        setUploadStatus({
          type: 'error',
          message: data.error || 'Upload failed',
        });
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: 'Network error. Please try again.',
      });
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const handleTextIngest = async () => {
    if (!textTitle.trim() || !textContent.trim() || isTextIngesting) return;

    setIsTextIngesting(true);
    setUploadStatus(null);

    try {
      const csrfToken = getCookieValue('chengai_csrf');
      const res = await fetch('/api/admin/knowledge/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          title: textTitle.trim(),
          content: textContent.trim(),
          sourceType,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setUploadStatus({
          type: 'success',
          message: `Imported ${data.title}: ${data.inserted} chunks`,
        });
        setTextTitle('');
        setTextContent('');
        fetchData();
      } else {
        setUploadStatus({ type: 'error', message: data.error || 'Import failed' });
      }
    } catch (error) {
      console.error('Text ingest error:', error);
      setUploadStatus({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setIsTextIngesting(false);
    }
  };

  const handleDelete = async (file: KnowledgeFile) => {
    if (!confirm(`Delete all chunks for "${file.name}" (${file.type})? This cannot be undone.`)) return;

    try {
      const csrfToken = getCookieValue('chengai_csrf');
      const res = await fetch('/api/admin/knowledge', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ sourceId: file.source_id, sourceType: file.type }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload files into the RAG knowledge base. Supports PDF, DOCX, TXT, and MD.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Upload className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Upload File</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Supports PDF, DOCX, TXT, and MD.
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Type:</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              disabled={isUploading || isTextIngesting}
            >
              <option value="article">Article</option>
              <option value="resume">Resume</option>
              <option value="story">Story</option>
              <option value="project">Project</option>
              <option value="skill">Skill</option>
            </select>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400'
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{uploadProgress}</p>
              </div>
            ) : (
              <>
                <Upload className="mx-auto h-10 w-10 text-zinc-400" />
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Drag and drop a file here, or{' '}
                  <label className="text-blue-600 hover:underline cursor-pointer">
                    click to select
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.txt,.md"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                  </label>
                </p>
              </>
            )}
          </div>

          {uploadStatus && (
            <div
              className={`mt-4 flex items-center justify-between rounded-lg p-3 ${
                uploadStatus.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
              }`}
            >
              <div className="flex items-center gap-2">
                {uploadStatus.type === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <span
                  className={`text-sm ${
                    uploadStatus.type === 'success' ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {uploadStatus.message}
                </span>
              </div>
              <button onClick={() => setUploadStatus(null)}>
                <X className="h-4 w-4 text-zinc-400 hover:text-zinc-600" />
              </button>
            </div>
          )}
        </div>

        {/* Text Ingest */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900 lg:col-span-2">
          <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">Paste Text</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Great for quickly adding article snippets, experience notes, and more (auto chunking + embeddings).
          </p>

          <div className="grid gap-3">
            <input
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Title (for citation and management)"
              className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              disabled={isTextIngesting || isUploading}
            />
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste content..."
              className="w-full min-h-[180px] rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              disabled={isTextIngesting || isUploading}
            />
            <button
              onClick={handleTextIngest}
              disabled={isTextIngesting || isUploading || !textTitle.trim() || !textContent.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isTextIngesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import text'
              )}
            </button>
          </div>
        </div>

        {/* Stats Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/30">
              <Database className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Knowledge Stats</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Chunks currently stored</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Total chunks</span>
                <span className="font-medium text-zinc-900 dark:text-white">{stats?.total || 0}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Articles</span>
                <span className="font-medium text-zinc-900 dark:text-white">{stats?.byType.article || 0}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Projects</span>
                <span className="font-medium text-zinc-900 dark:text-white">{stats?.byType.project || 0}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Resume</span>
                <span className="font-medium text-zinc-900 dark:text-white">{stats?.byType.resume || 0}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Stories</span>
                <span className="font-medium text-zinc-900 dark:text-white">{stats?.byType.story || 0}</span>
              </div>
            </div>
          )}
        </div>

        {/* Files List */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/30">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-white">Indexed Sources</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Each item powers RAG retrieval.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-4">
              No sources indexed yet. Upload a file or add content in Projects/Articles/Skills/Stories.
            </p>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={`${file.type}:${file.source_id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 group"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{file.name}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {file.type}
                    </span>
                    <span className="text-xs text-zinc-400">({file.chunks} chunks)</span>
                  </div>
                  <button
                    onClick={() => handleDelete(file)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
