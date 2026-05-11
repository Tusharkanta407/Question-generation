import { useRef, useState } from 'react';
import { Upload, X, FileVideo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type LectureFormMeta = {
  title: string;
  subject: string;
  chapter: string;
};

interface UploadAreaProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  meta: LectureFormMeta;
  onMetaChange: (patch: Partial<LectureFormMeta>) => void;
}

export default function UploadArea({
  file,
  onFileChange,
  meta,
  onMetaChange,
}: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (f.type.startsWith('video/')) {
      onFileChange(f);
      if (!meta.title.trim()) {
        const base = f.name.replace(/\.[^/.]+$/, '');
        onMetaChange({ title: base });
      }
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Lecture Studio</h3>
        {file && (
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1 transition-colors"
          >
            <X size={14} />
            RESET
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={`relative aspect-video rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-8 text-center gap-4 ${
          isDragOver
            ? 'border-blue-500 bg-blue-500/5 scale-[0.99]'
            : file
              ? 'border-blue-500/30 bg-premium-sidebar/50'
              : 'border-premium-border bg-premium-sidebar/20 hover:bg-premium-sidebar/40 hover:border-zinc-700'
        }`}
      >
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div key="empty" className="space-y-4">
              <div className="w-12 h-12 bg-premium-subtle rounded-full flex items-center justify-center mx-auto text-blue-500 border border-premium-border">
                <Upload size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-premium-text">Upload Today&apos;s Lecture</p>
                <p className="text-xs text-premium-muted mt-1">
                  Drag & Drop or{' '}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="text-blue-500 font-bold hover:underline underline-offset-4"
                  >
                    Browse
                  </button>
                </p>
              </div>
              <div className="text-[10px] text-premium-muted px-3 py-1 bg-premium-subtle rounded-md inline-block font-black uppercase tracking-widest">
                MP4 • MAX 5GB
              </div>
            </motion.div>
          ) : (
            <motion.div key="filled" className="space-y-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg shadow-blue-600/20">
                <FileVideo size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold truncate max-w-[280px] text-premium-text underline underline-offset-8 decoration-blue-500/50">
                  {file.name}
                </p>
                <p className="text-[10px] text-premium-muted font-black mt-3 uppercase tracking-wider">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • READY
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-premium-muted uppercase tracking-widest ml-1">
          Lecture title
        </label>
        <input
          type="text"
          value={meta.title}
          onChange={(e) => onMetaChange({ title: e.target.value })}
          placeholder="e.g. Thermodynamics — Lecture 4"
          className="w-full bg-premium-bg border border-premium-border rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50 transition-all text-xs text-premium-text shadow-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-premium-muted uppercase tracking-widest ml-1">Subject</label>
          <div className="relative group">
            <select
              value={meta.subject}
              onChange={(e) => onMetaChange({ subject: e.target.value })}
              className="w-full bg-premium-bg border border-premium-border rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50 transition-all text-xs text-premium-text appearance-none cursor-pointer shadow-sm"
            >
              <option>Physics (Advanced)</option>
              <option>Mathematics</option>
              <option>Chemistry</option>
              <option>Biology</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-premium-muted pointer-events-none text-[10px]">▼</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-premium-muted uppercase tracking-widest ml-1">Chapter Name</label>
          <input
            type="text"
            value={meta.chapter}
            onChange={(e) => onMetaChange({ chapter: e.target.value })}
            placeholder="Thermodynamics II"
            className="w-full bg-premium-bg border border-premium-border rounded-xl px-4 py-2.5 outline-none focus:border-blue-500/50 transition-all text-xs text-premium-text shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
