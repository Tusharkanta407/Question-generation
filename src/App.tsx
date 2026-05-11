"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Search, Sun, Moon } from 'lucide-react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Sidebar from './components/layout/Sidebar';
import StatCards from './components/dashboard/StatCards';
import UploadArea, { type LectureFormMeta } from './components/upload/UploadArea';
import StudentPanel, { type Student } from './components/upload/StudentPanel';
import UploadFlow, { SuccessState } from './components/upload/UploadFlow';
import { uploadVideoInChunks } from './lib/upload/resumableClient';

const defaultMeta: LectureFormMeta = {
  title: '',
  subject: 'Physics (Advanced)',
  chapter: '',
};

export default function App() {
  const { data: session, status: sessionStatus } = useSession();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [lecturesUploaded, setLecturesUploaded] = useState(0);
  const [questionsGenerated] = useState(0);
  const [studentsActive, setStudentsActive] = useState(0);
  const [lectureFile, setLectureFile] = useState<File | null>(null);
  const [lectureMeta, setLectureMeta] = useState<LectureFormMeta>(defaultMeta);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [lastEmailsSent, setLastEmailsSent] = useState(0);
  const hasLectureFile = lectureFile !== null;
  const isSignedIn = sessionStatus === 'authenticated';
  const canStartUpload = hasLectureFile && isSignedIn;

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const patchMeta = (patch: Partial<LectureFormMeta>) => {
    setLectureMeta((prev) => ({ ...prev, ...patch }));
  };

  const handleSendAccess = async (selectedStudents: Student[]) => {
    if (!lectureFile || !isSignedIn) return;

    const title =
      lectureMeta.title.trim() ||
      lectureFile.name.replace(/\.[^/.]+$/, '');

    setIsProcessing(true);
    setUploadProgress(0);
    setUploadStatus('Preparing resumable upload...');

    try {
      const jobId = await uploadVideoInChunks(
        lectureFile,
        {
          lectureTitle: title,
          subject: lectureMeta.subject,
          chapter: lectureMeta.chapter || undefined,
        },
        (pct) => {
          setUploadProgress(pct);
          setUploadStatus('Uploading video chunks...');
        }
      );

      setUploadStatus('Finalizing: Drive permissions, database, emails...');
      setUploadProgress(92);

      const finRes = await fetch(`/api/upload/${jobId}/finalize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: selectedStudents.map((s) => ({
            email: s.email,
            name: s.name,
          })),
        }),
      });

      const finText = await finRes.text();
      let finJson = {} as {
        emailsSent?: number;
        error?: string;
        skipped?: boolean;
      };
      try {
        finJson = JSON.parse(finText) as typeof finJson;
      } catch {
        /* non-JSON error body */
      }

      if (!finRes.ok) {
        throw new Error(finJson.error || finText || 'Finalize failed');
      }

      const sent = finJson.emailsSent ?? selectedStudents.length;
      setLastEmailsSent(sent);
      setUploadProgress(100);
      setIsProcessing(false);
      setShowSuccess(true);
      setLecturesUploaded((prev) => prev + 1);
      setLectureFile(null);
      setLectureMeta(defaultMeta);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg);
      setIsProcessing(false);
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  const handleReset = () => {
    setShowSuccess(false);
    setLastEmailsSent(0);
  };

  return (
    <div className={`flex min-h-screen bg-premium-bg ${isDark ? 'dark' : ''}`}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 ml-64 p-10 max-w-[1600px] mx-auto w-full">
        <header className="flex items-center justify-between mb-12">
          <div className="space-y-1">
            <h1 className="text-3xl font-display font-extrabold tracking-tight text-premium-text">Good Evening, Anshul Sir</h1>
            <p className="text-premium-muted text-sm font-medium">Your students are waiting for today&apos;s lecture.</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-premium-card border border-premium-border text-premium-text hover:bg-premium-subtle transition-all cursor-pointer shadow-sm active:scale-90"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-premium-card border border-premium-border text-premium-muted hover:text-premium-text transition-colors cursor-pointer group">
              <Search size={16} className="group-hover:scale-110 transition-transform" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent border-none outline-none text-xs w-32 placeholder:text-zinc-700"
              />
              <span className="text-[10px] font-bold bg-white/5 px-1.5 py-0.5 rounded border border-white/10 opacity-60">⌘ K</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-end">
              {sessionStatus === 'loading' ? (
                <span className="text-[10px] text-premium-muted uppercase tracking-widest">
                  Checking session…
                </span>
              ) : isSignedIn ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-premium-muted max-w-[140px] truncate hidden sm:inline">
                    {session?.user?.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="px-4 py-2 text-[10px] font-bold rounded-xl border border-premium-border text-premium-muted hover:text-premium-text uppercase tracking-widest"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => signIn('google')}
                  className="px-5 py-2.5 text-[10px] font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white uppercase tracking-widest shadow-lg shadow-blue-600/20"
                >
                  Connect Google Drive
                </button>
              )}
              <Link
                href="/question-generator"
                className="px-6 py-2.5 text-[11px] font-bold rounded-xl text-white uppercase tracking-widest transition-all active:scale-95 border border-zinc-700 bg-black hover:bg-zinc-900 shadow-lg shadow-black/30 inline-flex items-center justify-center"
              >
                Generate Questions
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab('lectures')}
                className="px-6 py-2.5 text-[11px] font-bold bg-black hover:bg-zinc-900 rounded-xl shadow-lg shadow-black/30 text-white uppercase tracking-widest transition-all active:scale-95 border border-zinc-700"
              >
                Upload Lecture
              </button>
              <div className="p-2.5 rounded-xl bg-premium-card border border-premium-border text-premium-muted hover:text-premium-text transition-all cursor-pointer relative ml-2 shadow-sm">
                <Bell size={20} />
                <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-premium-bg" />
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-10">
          <section>
            <StatCards
              lecturesUploaded={lecturesUploaded}
              questionsGenerated={questionsGenerated}
              studentsActive={studentsActive}
            />
          </section>

          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-12">
                <div className="bg-premium-card border border-premium-border rounded-3xl shadow-2xl overflow-hidden min-h-[500px]">
                  <div className="grid lg:grid-cols-2 h-full">
                    <div className="p-10 border-r border-premium-border">
                      <AnimatePresence mode="wait">
                        {showSuccess ? (
                          <SuccessState onReset={handleReset} emailsSent={lastEmailsSent} />
                        ) : (
                          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <UploadArea
                              file={lectureFile}
                              onFileChange={setLectureFile}
                              meta={lectureMeta}
                              onMetaChange={patchMeta}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="p-10 bg-premium-bg/40">
                      <StudentPanel
                        isProcessing={isProcessing}
                        canSend={canStartUpload}
                        onSend={handleSendAccess}
                        onStudentCountChange={setStudentsActive}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <AnimatePresence>
        {isProcessing && (
          <UploadFlow
            isProcessing={isProcessing}
            onComplete={() => {}}
            controlledProgress={uploadProgress}
            statusText={uploadStatus}
          />
        )}
      </AnimatePresence>

      <footer className="fixed bottom-6 right-6 flex items-center gap-4 text-[10px] font-bold text-premium-muted uppercase tracking-widest bg-premium-card/80 backdrop-blur-md px-6 py-3 rounded-full border border-premium-border shadow-2xl">
        <span>Acadza Pro v4.2</span>
        <div className="w-1 h-1 bg-premium-border rounded-full" />
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
          Resumable uploads enabled
        </span>
        <div className="w-1 h-1 bg-premium-border rounded-full" />
        <span className="cursor-pointer hover:text-blue-400 transition-colors">Support Center</span>
      </footer>
    </div>
  );
}
