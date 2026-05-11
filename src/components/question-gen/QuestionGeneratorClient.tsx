"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  Send,
  Square,
} from "lucide-react";
import {
  getSpeechRecognitionCtor,
  type SpeechRecognitionInstance,
  type SpeechRecognitionResultEvent,
} from "@/src/lib/speechRecognition";
import { latexishToPlainMath } from "@/src/lib/latexToPlainMath";

type PromptQuestion = {
  index: number;
  question: string;
  options: Record<string, string> | null;
  link: string | null;
  subject: string | null;
};

type PlanStep = {
  id: string;
  title: string;
  detail: string;
};

const PLAN_STEPS: PlanStep[] = [
  {
    id: "parse",
    title: "Understand prompt",
    detail: "Extract subject, topic, and how many items you need.",
  },
  {
    id: "retrieve",
    title: "Retrieve mixed bank",
    detail: "Blend previous-year and trending questions adaptively.",
  },
  {
    id: "format",
    title: "Teacher-ready format",
    detail: "Normalize wording, options, and source links.",
  },
];

const PLACEHOLDER_PROMPTS = [
  "10 thermodynamics questions from physics, with clear MCQs…",
  "20 mixed problems: kinematics and rotation, JEE-style…",
  "15 organic chemistry questions with source links…",
  "Give 12 questions on electrochemistry and equilibrium…",
];

function TypingPlaceholder({ active }: { active: boolean }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!active) {
      setDisplay("");
      return;
    }
    let cancelled = false;
    const full =
      PLACEHOLDER_PROMPTS[phraseIndex % PLACEHOLDER_PROMPTS.length] ?? "";

    const run = async () => {
      setDisplay("");
      for (let i = 1; i <= full.length; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 38));
        if (cancelled) return;
        setDisplay(full.slice(0, i));
      }
      await new Promise((r) => setTimeout(r, 2200));
      if (cancelled) return;
      for (let j = full.length - 1; j >= 0; j--) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 26));
        if (cancelled) return;
        setDisplay(full.slice(0, j));
      }
      if (!cancelled) setPhraseIndex((p) => p + 1);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [active, phraseIndex]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-20 w-full px-1 py-1 text-[15px] leading-relaxed text-zinc-400"
      aria-hidden
    >
      <span>{display}</span>
      <motion.span
        className="ml-0.5 inline-block w-px bg-zinc-400 align-middle"
        style={{ height: "1.15em" }}
        animate={{ opacity: [1, 0.25] }}
        transition={{ duration: 0.55, repeat: Infinity, repeatType: "reverse" }}
      />
    </div>
  );
}

export default function QuestionGeneratorClient() {
  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<PromptQuestion[]>([]);
  const [stepIndex, setStepIndex] = useState(-1);
  const [streamLine, setStreamLine] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  /** Set when API returns fewer questions than parsed `filters.count` (dataset still growing). */
  const [datasetShortfall, setDatasetShortfall] = useState<{
    returned: number;
    requested: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const showTypingPlaceholder = prompt.length === 0 && !inputFocused;

  useEffect(() => {
    const hadDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.remove("dark");
    setSpeechSupported(!!getSpeechRecognitionCtor());
    return () => {
      if (hadDark) document.documentElement.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const runProgressSimulation = useCallback(() => {
    setStepIndex(0);
    setStreamLine("");
    const full = "Building a short execution plan for your class set…";
    let i = 0;
    const tick = window.setInterval(() => {
      i += 1;
      setStreamLine(full.slice(0, i));
      if (i >= full.length) window.clearInterval(tick);
    }, 18);
    const t1 = window.setTimeout(() => setStepIndex(1), 450);
    const t2 = window.setTimeout(() => setStepIndex(2), 1100);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const toggleVoice = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (isListening) {
      stopListening();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    recognitionRef.current = rec;
    setIsListening(true);
    rec.onresult = (ev: SpeechRecognitionResultEvent) => {
      let addition = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const row = ev.results[i];
        const piece = row[0]?.transcript ?? "";
        if (row.isFinal && piece.trim()) {
          addition += `${piece.trim()} `;
        }
      }
      const trimmed = addition.trim();
      if (!trimmed) return;
      setPrompt((p) => (p.trim() ? `${p.trim()} ${trimmed}` : trimmed));
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    try {
      rec.start();
    } catch {
      setIsListening(false);
    }
  }, [isListening, stopListening]);

  const handleSubmit = async () => {
    const text = prompt.trim();
    if (!text || isRunning) return;
    setIsRunning(true);
    setError("");
    setQuestions([]);
    setDatasetShortfall(null);
    const cleanProgress = runProgressSimulation();
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const json = (await res.json()) as {
        questions?: PromptQuestion[];
        error?: string;
        filters?: { count?: number };
      };
      if (!res.ok) throw new Error(json.error || "Request failed");
      const list = json.questions ?? [];
      setQuestions(list);
      const rawRequested = json.filters?.count;
      const requested =
        typeof rawRequested === "number" && Number.isFinite(rawRequested)
          ? Math.max(0, Math.round(rawRequested))
          : 0;
      const returned = list.length;
      if (requested > 0 && returned < requested) {
        setDatasetShortfall({ returned, requested });
      } else {
        setDatasetShortfall(null);
      }
      setStepIndex(PLAN_STEPS.length);
      setPrompt("");
    } catch (e) {
      setStepIndex(-1);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      cleanProgress();
      setIsRunning(false);
    }
  };

  const stepVisual = useMemo(() => {
    return PLAN_STEPS.map((s, i) => {
      const done = !isRunning && questions.length > 0 && i <= stepIndex;
      const active = isRunning && stepIndex === i;
      const pending = stepIndex < i && isRunning;
      return { ...s, done, active, pending };
    });
  }, [isRunning, questions.length, stepIndex]);

  return (
    <div className="min-h-screen bg-white text-zinc-950 selection:bg-zinc-200">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
            <div className="hidden h-4 w-px bg-zinc-200 sm:block" />
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Question studio
            </h1>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-12">
          <section className="space-y-6 lg:col-span-7">
            <div className="relative overflow-hidden rounded-[28px] border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50 p-[1px] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.35)]">
              <div className="rounded-[27px] bg-white/90 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-500">
                    Describe what you need
                  </p>
                  <span className="text-[10px] font-medium text-zinc-400">
                    e.g. subject, topic, difficulty, count
                  </span>
                </div>
                <div className="relative min-h-[5.5rem]">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    rows={3}
                    placeholder=""
                    aria-label="Describe the question set: topic, subject, and how many questions"
                    className="relative z-10 min-h-[5.5rem] w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-zinc-900 caret-zinc-900 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSubmit();
                      }
                    }}
                  />
                  <TypingPlaceholder active={showTypingPlaceholder} />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleVoice}
                      disabled={!speechSupported}
                      title={
                        speechSupported
                          ? isListening
                            ? "Stop recording"
                            : "Speak to fill the box"
                          : "Voice input not supported in this browser"
                      }
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-zinc-800 transition ${
                        isListening
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-zinc-200 bg-zinc-50 hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {isListening ? (
                        <Square className="h-4 w-4 fill-current" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </button>
                    <span className="text-[11px] text-zinc-500">
                      {isListening
                        ? "Listening… tap stop when done"
                        : speechSupported
                          ? "Voice to text"
                          : "Use Chrome / Edge for voice"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={isRunning || !prompt.trim()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-zinc-900/15 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating
                      </>
                    ) : (
                      <>
                        Run
                        <Send className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            {datasetShortfall ? (
              <div
                className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-950"
                role="status"
              >
                <p className="font-medium text-amber-900">Fewer questions than requested</p>
                <p className="mt-1.5 text-amber-900/90">
                  {datasetShortfall.returned === 0 ? (
                    <>
                      Sorry — we could not find enough matching questions for this prompt yet
                      (you asked for{" "}
                      <span className="font-semibold tabular-nums">
                        {datasetShortfall.requested}
                      </span>
                      ). We are still growing the dataset and will add more coverage soon.
                    </>
                  ) : (
                    <>
                      Sorry — right now we only have{" "}
                      <span className="font-semibold tabular-nums">
                        {datasetShortfall.returned}
                      </span>{" "}
                      matching{" "}
                      {datasetShortfall.returned === 1 ? "question" : "questions"} in the
                      bank, not the{" "}
                      <span className="font-semibold tabular-nums">
                        {datasetShortfall.requested}
                      </span>{" "}
                      you asked for. We are working on the dataset and you will be able to pull
                      larger sets soon.
                    </>
                  )}
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Results</h2>
                <span className="text-xs text-zinc-500">
                  {questions.length
                    ? `${questions.length} items`
                    : "Waiting for a run"}
                </span>
              </div>
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {questions.map((item) => (
                    <motion.article
                      key={`${item.index}-${item.link ?? "nolink"}`}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                    >
                      <p className="text-sm font-medium text-zinc-900">
                        <span className="text-zinc-500">{item.index}.</span>{" "}
                        {latexishToPlainMath(item.question)}
                      </p>
                      {item.options ? (
                        <div className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
                          {Object.entries(item.options).map(([k, v]) => (
                            <p key={k}>
                              <span className="font-semibold text-zinc-900">
                                {k})
                              </span>{" "}
                              {latexishToPlainMath(String(v))}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-xs font-semibold text-blue-700 underline-offset-4 hover:underline"
                        >
                          Source link
                        </a>
                      ) : null}
                    </motion.article>
                  ))}
                </AnimatePresence>
                {!questions.length && !isRunning ? (
                  <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                    Your formatted questions will land here with options and
                    links.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="lg:col-span-5">
            <div className="sticky top-8 space-y-4 rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-5 shadow-inner shadow-zinc-100 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Processing
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">
                    Live plan stream
                  </p>
                </div>
                {isRunning ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 ring-1 ring-zinc-200">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    Running
                  </span>
                ) : null}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
                <p className="font-mono text-[13px] leading-relaxed text-zinc-800">
                  {streamLine}
                  {isRunning ? (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-900 align-middle" />
                  ) : null}
                </p>
              </div>

              <div className="space-y-0">
                {stepVisual.map((step, idx) => (
                  <div key={step.id} className="relative flex gap-3 pb-6">
                    {idx !== stepVisual.length - 1 ? (
                      <div
                        className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-200"
                        aria-hidden
                      />
                    ) : null}
                    <div
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        step.done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : step.active
                            ? "border-zinc-900 bg-zinc-900 text-white shadow-lg shadow-zinc-900/20"
                            : "border-zinc-200 bg-white text-zinc-400"
                      }`}
                    >
                      {step.done ? (
                        <Check className="h-4 w-4" />
                      ) : step.active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div className="space-y-1 pt-0.5">
                      <p className="text-sm font-semibold text-zinc-900">
                        {step.title}
                      </p>
                      <p className="text-xs text-zinc-600">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
