import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  BookOpen, 
  Clock, 
  Trash2, 
  Sparkles, 
  ChevronRight, 
  Presentation, 
  FileCode, 
  FileCheck,
  AlertCircle,
  Eye
} from 'lucide-react';
import { ActiveDoc, FileExtension, RecentDocItem } from '../types';
import { SAMPLE_DOCS, createSampleActiveDoc, SampleDocDefinition } from '../data/sampleDocs';
import { putFileBlob, removeRecentDoc, clearRecentDocs } from '../utils/storage';

interface DashboardProps {
  recentDocs: RecentDocItem[];
  onOpenDoc: (doc: ActiveDoc) => void;
  onRefreshRecent: (updated: RecentDocItem[]) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  recentDocs,
  onOpenDoc,
  onRefreshRecent,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getBadgeStyle = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'pdf':
        return {
          bg: 'bg-rose-500/15',
          text: 'text-rose-400',
          border: 'border-rose-500/30',
          icon: <FileText className="w-4 h-4 text-rose-400" />,
          label: 'PDF',
        };
      case 'docx':
      case 'doc':
        return {
          bg: 'bg-blue-500/15',
          text: 'text-blue-400',
          border: 'border-blue-500/30',
          icon: <FileText className="w-4 h-4 text-blue-400" />,
          label: 'DOCX',
        };
      case 'pptx':
      case 'ppt':
        return {
          bg: 'bg-amber-500/15',
          text: 'text-amber-400',
          border: 'border-amber-500/30',
          icon: <Presentation className="w-4 h-4 text-amber-400" />,
          label: 'PPTX',
        };
      case 'txt':
      case 'md':
      default:
        return {
          bg: 'bg-emerald-500/15',
          text: 'text-emerald-400',
          border: 'border-emerald-500/30',
          icon: <FileCode className="w-4 h-4 text-emerald-400" />,
          label: ext.toUpperCase() || 'TXT',
        };
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';

    if (rawExt === 'doc' || rawExt === 'ppt') {
      setErrorMsg('Legacy .doc and .ppt formats are unsupported. Please save as .docx or .pptx.');
      return;
    }

    if (!['pdf', 'docx', 'pptx', 'txt', 'md'].includes(rawExt)) {
      setErrorMsg(`Unsupported file type (.${rawExt}). Supported formats: PDF, DOCX, PPTX, TXT, MD.`);
      return;
    }

    const ext = rawExt as FileExtension;

    setErrorMsg('');
    setIsProcessing(true);

    try {
      // Store in IndexedDB for fast re-opening later
      await putFileBlob(file.name, file);
      const buffer = await file.arrayBuffer();

      onOpenDoc({
        name: file.name,
        ext,
        asset: {
          file,
          buffer,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to read document.';
      setErrorMsg(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleRemoveRecent = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const updated = removeRecentDoc(name);
    onRefreshRecent(updated);
  };

  const handleClearAll = () => {
    clearRecentDocs();
    onRefreshRecent([]);
  };

  const formatDate = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#0D0D12] text-[#EDEDED] flex flex-col">
      {/* Sleek Top Header Banner */}
      <header className="sticky top-0 z-40 bg-[#0D0D12]/80 backdrop-blur-md border-b border-[#2A2A3B]">
        <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
          {/* Logo & App Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#6366F1] flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Boustro Reader</span>
                <span className="text-[11px] font-semibold tracking-wider uppercase text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                  Pro View
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">2D Boustrophedon Flow & TTS Synchronized Highlighting</p>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-[10px] bg-gradient-to-r from-[#3B82F6] to-[#6366F1] hover:from-[#2563EB] hover:to-[#4F46E5] text-white text-sm font-semibold shadow-md shadow-blue-500/25 active:scale-95 transition-all duration-150 flex items-center gap-2 cursor-pointer border border-blue-400/30"
            >
              <Upload className="w-4 h-4" />
              <span>{isProcessing ? 'Processing…' : '+ Import Document'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-10">
        {/* Error Notice */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex items-start gap-3 text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-rose-200">Unable to open document</div>
              <p className="text-xs text-rose-300/80 mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg('')}
              className="text-xs text-rose-400 hover:text-rose-200 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Drag & Drop Hero Zone */}
        <section
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
            dragActive
              ? 'border-[#3B82F6] bg-[#3B82F6]/10 scale-[1.008]'
              : 'border-[#2A2A3B] bg-[#1A1A24]/60 hover:border-[#3B82F6]/60 hover:bg-[#1A1A24]'
          }`}
        >
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#1A1A24] to-[#2A2A3B] border border-[#2A2A3B] flex items-center justify-center text-[#3B82F6] shadow-inner">
              <Upload className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">
                Drag and drop your document here, or <span className="text-[#3B82F6] hover:underline">browse files</span>
              </h2>
              <p className="text-xs text-slate-400">
                Supports PDF, Microsoft Word (DOCX), PowerPoint (PPTX), and Plain Text (TXT/MD)
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5 text-blue-400" /> Original visual styling</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> 2D Boustrophedon glide</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><VolumeIcon className="w-3.5 h-3.5 text-emerald-400" /> Speech sync</span>
            </div>
          </div>
        </section>

        {/* Quick Launch Curated Sample Documents */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                <span>Instant Test Samples</span>
              </h2>
              <p className="text-xs text-slate-400">Try 2D kinetic reading and TTS highlighting immediately without uploading</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAMPLE_DOCS.map((sample: SampleDocDefinition) => {
              const badge = getBadgeStyle(sample.ext);
              return (
                <div
                  key={sample.id}
                  onClick={() => onOpenDoc(createSampleActiveDoc(sample))}
                  className="group relative p-5 rounded-xl bg-[#1A1A24] border border-[#2A2A3B] hover:border-[#3B82F6]/50 hover:bg-[#1E1E2B] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:shadow-blue-500/5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className={`px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider flex items-center gap-1.5 border ${badge.bg} ${badge.text} ${badge.border}`}>
                        {badge.icon}
                        <span>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{sample.pages} {sample.ext === 'pptx' ? 'slides' : 'pages'}</span>
                        <span>·</span>
                        <span>{sample.readTime}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                        {sample.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {sample.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#2A2A3B]/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-white">
                    <span className="text-[11px] text-slate-500 font-medium">{sample.category}</span>
                    <span className="flex items-center gap-1 text-[#3B82F6] font-medium group-hover:translate-x-0.5 transition-transform">
                      Read now <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Documents Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Recent Documents</span>
              </h2>
              <p className="text-xs text-slate-400">Documents opened on this device are cached for rapid access</p>
            </div>
            {recentDocs.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                Clear history
              </button>
            )}
          </div>

          {recentDocs.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#1A1A24]/40 border border-[#2A2A3B] text-center space-y-2">
              <div className="w-10 h-10 mx-auto rounded-full bg-[#1A1A24] border border-[#2A2A3B] flex items-center justify-center text-slate-500">
                <BookOpen className="w-5 h-5" />
              </div>
              <p className="text-sm text-slate-300 font-medium">No documents opened yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Import a PDF, Word document, presentation, or text file above, or select an instant test sample to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentDocs.map((item) => {
                const badge = getBadgeStyle(item.ext);
                return (
                  <div
                    key={item.id || item.name}
                    onClick={() => {
                      // Trigger opening document from IndexedDB
                      onOpenDoc({
                        name: item.name,
                        ext: item.ext,
                        asset: {}, // will be retrieved by reader via getFileBlob
                      });
                    }}
                    className="group relative p-5 rounded-xl bg-[#1A1A24] border border-[#2A2A3B] hover:border-[#3B82F6]/60 hover:bg-[#1E1E2B] transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:shadow-blue-500/5 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className={`px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wider flex items-center gap-1.5 border ${badge.bg} ${badge.text} ${badge.border}`}>
                          {badge.icon}
                          <span>{badge.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">{formatDate(item.date)}</span>
                          <button
                            title="Remove from history"
                            onClick={(e) => handleRemoveRecent(e, item.name)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                          {item.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.preview || 'No preview available for this document.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#2A2A3B]/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-white">
                      <span className="text-[11px] text-slate-500">Tap to resume</span>
                      <span className="flex items-center gap-1 text-[#3B82F6] font-medium group-hover:translate-x-0.5 transition-transform">
                        <Eye className="w-3.5 h-3.5" /> Open
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

function VolumeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
