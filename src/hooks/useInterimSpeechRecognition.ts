import { useEffect, useRef, useCallback } from 'react';

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

interface UseInterimSpeechRecognitionProps {
  /** Whether recognition should be active */
  enabled: boolean;
  /** Pause while AI is speaking or mic is muted */
  paused: boolean;
  /** Called with running interim/final transcript while user speaks */
  onInterimTranscript: (text: string) => void;
}

/**
 * Browser SpeechRecognition for real-time interim captions during voice calls.
 * Gemini Live inputTranscription often arrives only after the user stops speaking;
 * this hook fills the gap so the live user bubble updates while they talk.
 */
export const useInterimSpeechRecognition = ({
  enabled,
  paused,
  onInterimTranscript,
}: UseInterimSpeechRecognitionProps) => {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const callbacksRef = useRef({ onInterimTranscript });
  const pausedRef = useRef(paused);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    callbacksRef.current = { onInterimTranscript };
  });

  useEffect(() => {
    pausedRef.current = paused;
    enabledRef.current = enabled;
  }, [paused, enabled]);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    rec.onresult = null;
    rec.onend = null;
    rec.onerror = null;
    try {
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    recognitionRef.current = null;
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition();

    if (!SpeechRecognitionCtor || !enabledRef.current || pausedRef.current) return;

    stopRecognition();

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (pausedRef.current) return;

      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }

      const trimmed = text.trim();
      if (trimmed) {
        callbacksRef.current.onInterimTranscript(trimmed);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[useInterimSpeechRecognition]', event.error);
      }
    };

    rec.onend = () => {
      if (enabledRef.current && !pausedRef.current && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {
          /* restart on next resume */
        }
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
    } catch (e) {
      console.warn('[useInterimSpeechRecognition] Failed to start:', e);
    }
  }, [stopRecognition]);

  /** Reset session so the next user turn starts with a clean buffer */
  const resetInterim = useCallback(() => {
    stopRecognition();
    if (enabledRef.current && !pausedRef.current) {
      startRecognition();
    }
  }, [stopRecognition, startRecognition]);

  // Start/stop with call lifecycle
  useEffect(() => {
    if (enabled) {
      startRecognition();
    } else {
      stopRecognition();
    }
    return stopRecognition;
  }, [enabled, startRecognition, stopRecognition]);

  // Pause/resume when AI speaks or mic is muted
  useEffect(() => {
    if (!enabled) return;
    if (paused) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }, [paused, enabled, startRecognition, stopRecognition]);

  return { resetInterim };
};
