import { useState, useRef, useEffect } from 'react';

export interface UseGeminiLiveProps {
  apiKey: string;
  voiceName?: string;
  isMuted?: boolean;
  onStatusChange: (status: 'listening' | 'speaking' | 'connected' | 'connecting' | 'disconnected') => void;
  onError: (msg: string) => void;
  /** Called continuously with the live running transcript as the user speaks */
  onUserTranscript: (text: string) => void;
  /** Called continuously with the live running transcript as the AI speaks */
  onAiTranscript: (text: string) => void;
  /** Called once per turn when the AI finishes responding — both texts are finalized and in correct order */
  onTurnComplete: (userText: string, aiText: string) => void;
  /** Pass the current conversation's messages so the model inherits previous context on reconnect */
  previousMessages?: { sender: 'user' | 'assistant'; text: string }[];
}

export const useGeminiLive = ({
  apiKey,
  voiceName = 'Puck',
  isMuted = false,
  onStatusChange,
  onError,
  onUserTranscript,
  onAiTranscript,
  onTurnComplete,
  previousMessages = []
}: UseGeminiLiveProps) => {
  const [isActive, setIsActive] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Audio playback scheduling
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Per-turn accumulation refs (reset every turnComplete)
  const accumulatedUserTextRef = useRef<string>('');
  const accumulatedAiTextRef = useRef<string>('');

  // Guard: prevents double-fire on stopLiveSession being called twice
  const stoppedRef = useRef<boolean>(false);

  // Keep latest callbacks in refs to prevent stale closure issues in WebSocket callbacks
  const callbacksRef = useRef({
    onStatusChange,
    onError,
    onUserTranscript,
    onAiTranscript,
    onTurnComplete
  });

  // Always update refs with current callbacks on every render
  useEffect(() => {
    callbacksRef.current = {
      onStatusChange,
      onError,
      onUserTranscript,
      onAiTranscript,
      onTurnComplete
    };
  });

  const stopAllPlayback = () => {
    activeSourcesRef.current.forEach(src => { try { src.stop(); } catch (e) {} });
    activeSourcesRef.current.clear();
    nextPlayTimeRef.current = 0;
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  const queueAudioChunk = async (base64Data: string) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    try {
      const bufferBytes = new Uint8Array(base64ToArrayBuffer(base64Data));
      const float32 = new Float32Array(bufferBytes.length / 2);
      const dataView = new DataView(bufferBytes.buffer, bufferBytes.byteOffset, bufferBytes.byteLength);
      for (let i = 0; i < float32.length; i++) {
        float32[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      activeSourcesRef.current.add(source);
      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0) callbacksRef.current.onStatusChange('listening');
      };

      const playTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
      source.start(playTime);
      nextPlayTimeRef.current = playTime + audioBuffer.duration;
      callbacksRef.current.onStatusChange('speaking');
    } catch (e) {
      console.error('[useGeminiLive] Error decoding audio chunk:', e);
    }
  };

  const processAndSendMicAudio = (inputData: Float32Array, inputSampleRate: number) => {
    if (isMuted) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(inputData.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0, offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffset = Math.round((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffset && i < inputData.length; i++) { accum += inputData[i]; count++; }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffset;
    }

    const buffer = new ArrayBuffer(result.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < result.length; i++) {
      const s = Math.max(-1, Math.min(1, result[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    const binary = String.fromCharCode(...new Uint8Array(buffer));
    socketRef.current.send(JSON.stringify({
      realtimeInput: {
        audio: { mimeType: 'audio/pcm;rate=16000', data: window.btoa(binary) }
      }
    }));
  };

  const startLiveSession = async () => {
    if (isActive) return;
    setIsActive(true);
    stoppedRef.current = false;
    accumulatedUserTextRef.current = '';
    accumulatedAiTextRef.current = '';
    onStatusChange('connecting');

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      nextPlayTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        callbacksRef.current.onStatusChange('connected');

        // Build context instructions from previous messages
        let contextInstruction = "You are a helpful voice assistant named AskMe.\n";
        if (previousMessages && previousMessages.length > 0) {
          contextInstruction += "\nHere is the conversation history so far for context. Please continue discussing the same topics if the user asks follow-up questions:\n";
          previousMessages.forEach(msg => {
            const roleName = msg.sender === 'user' ? 'User' : 'Assistant (You)';
            contextInstruction += `[${roleName}]: ${msg.text}\n`;
          });
          contextInstruction += "\nNow, continue the conversation organically.\n";
        }

        socket.send(JSON.stringify({
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } }
              }
            },
            systemInstruction: {
              parts: [{ text: contextInstruction }]
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          }
        }));

        const source = audioCtx.createMediaStreamSource(stream);
        micSourceRef.current = source;
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        micNodeRef.current = processor;
        processor.onaudioprocess = (e) => processAndSendMicAudio(e.inputBuffer.getChannelData(0), audioCtx.sampleRate);
        source.connect(processor);
        processor.connect(audioCtx.destination);

        callbacksRef.current.onStatusChange('listening');
      };

      socket.onmessage = async (event) => {
        try {
          let rawData = event.data;
          if (event.data instanceof Blob) rawData = await event.data.text();
          const payload = JSON.parse(rawData);

          // ── Interruption: user spoke while AI was talking ──
          if (payload.serverContent?.interrupted) {
            console.log('[useGeminiLive] Interrupted by user');
            stopAllPlayback();

            const userText = accumulatedUserTextRef.current.trim();
            const aiText = accumulatedAiTextRef.current.trim();
            accumulatedUserTextRef.current = '';
            accumulatedAiTextRef.current = '';

            // Flush the interrupted turn immediately so sequence is correct
            if (userText || aiText) {
              callbacksRef.current.onTurnComplete(userText, aiText);
            }
            return;
          }

          // ── User speech transcription (live, streaming) ──
          const inputTranscription = payload.serverContent?.inputTranscription;
          if (inputTranscription?.text) {
            accumulatedUserTextRef.current = inputTranscription.text.trim();
            callbacksRef.current.onUserTranscript(accumulatedUserTextRef.current);
          }

          // ── AI response transcription (live, streaming) ──
          let aiChunk = '';
          const parts = payload.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) { if (part.text) aiChunk += part.text; }
          }
          const outputTranscription = payload.serverContent?.outputTranscription;
          if (outputTranscription?.text) aiChunk += outputTranscription.text;

          if (aiChunk) {
            accumulatedAiTextRef.current += aiChunk;
            callbacksRef.current.onAiTranscript(accumulatedAiTextRef.current);
          }

          // ── Turn complete: both user and AI text are finalized ──
          if (payload.serverContent?.turnComplete) {
            const userText = accumulatedUserTextRef.current.trim();
            const aiText = accumulatedAiTextRef.current.trim();
            accumulatedUserTextRef.current = '';
            accumulatedAiTextRef.current = '';
            if (userText || aiText) {
              callbacksRef.current.onTurnComplete(userText, aiText);
            }
          }

          // ── Audio playback ──
          if (parts?.[0]?.inlineData?.data) {
            queueAudioChunk(parts[0].inlineData.data);
          }
        } catch (err) {
          console.error('[useGeminiLive] Error parsing message:', err);
        }
      };

      socket.onerror = () => {
        callbacksRef.current.onError('WebSocket error. Check your API Key and network.');
        stopLiveSession();
      };

      socket.onclose = (event) => {
        console.warn('[useGeminiLive] WS closed:', event.code, event.reason);
        if (event.code !== 1000 && event.code !== 1001) {
          callbacksRef.current.onError(`Connection closed. Code: ${event.code}`);
        }
        stopLiveSession();
      };

    } catch (err: any) {
      callbacksRef.current.onError(err.message || 'Failed to start live voice session.');
      stopLiveSession();
    }
  };

  const stopLiveSession = () => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;

    setIsActive(false);
    stopAllPlayback();
    callbacksRef.current.onStatusChange('disconnected');

    // Flush any in-progress turn when user manually hangs up
    const userText = accumulatedUserTextRef.current.trim();
    const aiText = accumulatedAiTextRef.current.trim();
    accumulatedUserTextRef.current = '';
    accumulatedAiTextRef.current = '';
    if (userText || aiText) {
      callbacksRef.current.onTurnComplete(userText, aiText);
    }

    if (socketRef.current) {
      try { socketRef.current.onclose = null; socketRef.current.onerror = null; socketRef.current.close(); } catch (e) {}
      socketRef.current = null;
    }
    if (micNodeRef.current) { try { micNodeRef.current.disconnect(); } catch (e) {} micNodeRef.current = null; }
    if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch (e) {} micSourceRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch (e) {} audioContextRef.current = null; }
  };

  useEffect(() => () => { stopLiveSession(); }, []);

  return { isActive, startLiveSession, stopLiveSession };
};
