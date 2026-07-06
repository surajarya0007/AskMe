import { useEffect, useRef, useState } from 'react';

export interface UseSpeechProps {
  onSpeechEnd: (text: string) => void;
  onStatusChange: (status: 'listening' | 'speaking' | 'connected' | 'connecting') => void;
}

export const useSpeech = ({ onSpeechEnd, onStatusChange }: UseSpeechProps) => {
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);

  // Initialize Speech APIs
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const hasRecognition = !!SpeechRecognition;
    const hasSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

    setIsSupported(hasRecognition && hasSynthesis);

    if (hasRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
        onStatusChange('listening');
      };

      rec.onresult = (event: any) => {
        // If we are currently speaking AI audio, ignore speech input
        if (isSpeakingRef.current) return;

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const currentText = final || interim;
        if (currentText.trim()) {
          setLiveTranscript(currentText);
          
          // Clear previous silence timer
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

          // Reset silence detection: if user doesn't speak for 1.8 seconds, finish speech
          silenceTimerRef.current = setTimeout(() => {
            if (currentText.trim() && !isSpeakingRef.current) {
              handleUserSpeechFinished(currentText);
            }
          }, 1800);
        }
      };

      rec.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.error('Speech recognition error:', event.error);
        }
      };

      rec.onend = () => {
        setIsListening(false);
        // If recognition stops but we are NOT currently speaking, restart it to keep listening
        if (!isSpeakingRef.current && recognitionRef.current && isListening) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Ignore if already started
          }
        }
      };

      recognitionRef.current = rec;
    }

    if (hasSynthesis) {
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
      };
      
      loadVoices();
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleUserSpeechFinished = (finalText: string) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    
    // Stop listening temporarily before we process
    try {
      recognitionRef.current.stop();
    } catch (e) {}
    
    setLiveTranscript('');
    onSpeechEnd(finalText);
  };

  const startListening = () => {
    if (!isSupported || !recognitionRef.current) return;
    
    setLiveTranscript('');
    isSpeakingRef.current = false;
    
    try {
      recognitionRef.current.start();
    } catch (e) {
      console.warn("SpeechRecognition already running:", e);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current) return;
    
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    
    try {
      recognitionRef.current.stop();
    } catch (e) {}
    
    setIsListening(false);
  };

  const speak = (
    text: string,
    voiceName?: string,
    rate: number = 1.0,
    pitch: number = 1.0
  ) => {
    if (!isSupported) return;

    // Cancel any ongoing speaking
    window.speechSynthesis.cancel();

    // Set speaking states
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    onStatusChange('speaking');
    stopListening(); // Don't listen to ourselves

    // Clean text from markdown patterns (like asterisks, hash signs, etc.)
    const cleanText = text
      .replace(/[\*\#\`\_]/g, '')
      .replace(/-\s+/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Select Voice
    if (voiceName) {
      const selectedVoice = voices.find(v => v.name === voiceName);
      if (selectedVoice) utterance.voice = selectedVoice;
    }
    
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      onStatusChange('listening');
      // Restart listening after AI is done speaking
      startListening();
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      onStatusChange('listening');
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  };

  return {
    isSupported,
    voices,
    liveTranscript,
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
};
