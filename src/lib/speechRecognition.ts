/** Minimal types for Web Speech API (not in all TypeScript DOM libs). */

export type SpeechRecognitionResultEvent = Event & {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal: boolean;
      readonly 0?: { readonly transcript: string };
    };
  };
};

export type SpeechRecognitionInstance = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionInstance)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
