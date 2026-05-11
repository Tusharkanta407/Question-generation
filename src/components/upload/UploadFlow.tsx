import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2, CheckCircle2, FileText, Share2, Users } from 'lucide-react';

interface UploadFlowProps {
  isProcessing: boolean;
  onComplete: () => void;
  /** When set, progress bar follows this value (0–100) instead of the demo timer. */
  controlledProgress?: number | null;
  /** Primary status line while uploading / finalizing. */
  statusText?: string;
}

const steps = [
  'Uploading to cloud storage...',
  'Securing lecture on Drive...',
  'Saving lecture metadata...',
  'Generating student access...',
  'Sending email invitations...',
];

export default function UploadFlow({
  isProcessing,
  onComplete,
  controlledProgress,
  statusText,
}: UploadFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const isControlled = controlledProgress != null;

  useEffect(() => {
    if (isControlled) {
      setProgress(Math.min(100, Math.max(0, controlledProgress!)));
      const stepIdx = Math.min(
        steps.length - 1,
        Math.floor((controlledProgress! / 100) * steps.length)
      );
      setCurrentStep(stepIdx);
      return;
    }

    if (isProcessing) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 1;
        });
      }, 50);

      const stepInterval = setInterval(() => {
        setCurrentStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(stepInterval);
      };
    } else {
      setProgress(0);
      setCurrentStep(0);
    }
  }, [isProcessing, isControlled, controlledProgress]);

  useEffect(() => {
    if (isControlled) return;
    if (progress === 100) {
      setTimeout(onComplete, 1000);
    }
  }, [progress, onComplete, isControlled]);

  const label = statusText ?? steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="premium-card max-w-lg w-full p-10 space-y-8 bg-[#111111] border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
      >
        <div className="space-y-2 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">Lecture upload</h2>
          <p className="text-zinc-500 font-medium">Resumable upload — safe for large video files</p>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2 text-zinc-300">
              <Loader2 className="animate-spin text-blue-500" size={18} />
              {label}
            </span>
            <span className="font-mono text-blue-500">{progress}%</span>
          </div>

          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {steps.map((step, index) => (
              <div
                key={step}
                className={`flex items-center gap-2 text-[10px] font-bold p-3 rounded-xl transition-all uppercase tracking-wider ${
                  index <= currentStep
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'bg-white/5 text-zinc-600 border border-white/5 opacity-40'
                }`}
              >
                {index < currentStep ? (
                  <CheckCircle2 size={14} className="text-blue-500" />
                ) : index === currentStep ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-current opacity-20" />
                )}
                {step.split('...')[0]}
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-white/5">
          <p className="text-[10px] uppercase tracking-widest text-center text-zinc-600 leading-relaxed font-bold">
            Large uploads use chunked resumable sessions to Google Drive
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export function SuccessState({
  onReset,
  emailsSent = 0,
}: {
  onReset: () => void;
  emailsSent?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-8 text-center"
    >
      <div className="w-20 h-20 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-blue-500/20 border border-blue-500/20">
        <CheckCircle2 size={40} />
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-display font-bold tracking-tight text-white">Lecture Ready</h2>
        <p className="text-zinc-500 font-medium">
          {emailsSent > 0
            ? `Access links sent to ${emailsSent} student(s).`
            : 'Lecture saved. Add recipients to send access emails.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
          <FileText size={20} className="mx-auto text-zinc-500" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Drive</p>
          <p className="text-xs font-bold text-zinc-200">Uploaded</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
          <Users size={20} className="mx-auto text-zinc-500" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Students</p>
          <p className="text-xs font-bold text-zinc-200">{emailsSent} sent</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
          <Share2 size={20} className="mx-auto text-zinc-500" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Access</p>
          <p className="text-xs font-bold text-zinc-200">Live</p>
        </div>
      </div>

      <div className="flex gap-4 pt-6">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl border border-white/5"
        >
          VIEW DASHBOARD
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20"
        >
          UPLOAD NEW
        </button>
      </div>
    </motion.div>
  );
}
