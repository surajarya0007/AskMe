import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { LoginModal } from './components/LoginModal';
import { useApp } from './context/AppContext';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useInterimSpeechRecognition } from './hooks/useInterimSpeechRecognition';
import { useGemini } from './hooks/useGemini';
import { getMockReply } from './utils/mockData';
import { AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const {
    messages,
    addMessage,
    addMessagesBulk,
    activeSessionId,
    settings,
    callState,
    setCallState,
    error,
    setError,
    user,
    registerSessionSwitchHandler
  } = useApp();

  const { generateResponse } = useGemini();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [aiResponding, setAiResponding] = useState(false);

  // Auto-open login modal on mount if user is not signed in
  useEffect(() => {
    if (!user) setIsLoginOpen(true);
  }, [user]);

  // Live voice transcript states — displayed in chat in real-time while call is active
  const [liveUserText, setLiveUserText] = useState('');
  const [liveAiText, setLiveAiText] = useState('');
  const geminiUserTextRef = useRef('');
  const interimUserTextRef = useRef('');
  
  const processingRef = useRef(false);

  const updateLiveUserText = useCallback(() => {
    setLiveUserText(geminiUserTextRef.current || interimUserTextRef.current);
  }, []);

  const resetInterimRef = useRef<(() => void)>(() => {});

  // Initialize Gemini Live WebSocket hook
  const {
    isActive: isLiveActive,
    startLiveSession,
    stopLiveSession,
    userAnalyser,
    aiAnalyser
  } = useGeminiLive({
    apiKey: settings.apiKey || import.meta.env.VITE_GEMINI_API_KEY || '',
    voiceName: settings.voiceName || 'Puck',
    isMuted,
    previousMessages: messages.map(m => ({ sender: m.sender, text: m.text })),

    onStatusChange: (status) => {
      setCallState(prev => ({
        ...prev,
        status: status === 'disconnected' ? 'disconnected' : status,
      }));
    },

    onError: (msg) => setError(msg),

    // Gemini transcription (may lag until user stops speaking)
    onUserTranscript: (text) => {
      geminiUserTextRef.current = text;
      updateLiveUserText();
    },

    onAiTranscript: (text) => {
      setLiveAiText(text);
    },

    onTurnComplete: async (userText, aiText, isSessionSwitch) => {
      const finalUserText = userText || interimUserTextRef.current;
      
      // Clear live states synchronously to avoid split-second duplicate bubbles in UI
      geminiUserTextRef.current = '';
      interimUserTextRef.current = '';
      setLiveUserText('');
      setLiveAiText('');
      resetInterimRef.current();

      try {
        const msgsToSave = [];
        if (finalUserText) msgsToSave.push({ sender: 'user' as const, text: finalUserText });
        if (aiText) msgsToSave.push({ sender: 'assistant' as const, text: aiText });
        if (msgsToSave.length > 0) {
          await addMessagesBulk(msgsToSave, activeSessionId, isSessionSwitch);
        }
      } catch (e) {
        console.error('[App] Failed to save voice turn:', e);
      }
    }
  });

  // Browser interim captions — updates the live bubble while the user is still talking
  const { resetInterim } = useInterimSpeechRecognition({
    enabled: isLiveActive,
    paused: isMuted || callState.status === 'speaking',
    onInterimTranscript: (text) => {
      interimUserTextRef.current = text;
      if (!geminiUserTextRef.current) {
        setLiveUserText(text);
      }
    },
  });

  useEffect(() => {
    resetInterimRef.current = resetInterim;
  }, [resetInterim]);

  // Sync Live session active state with callState
  useEffect(() => {
    setCallState(prev => ({ ...prev, isActive: isLiveActive }));
    if (!isLiveActive) {
      geminiUserTextRef.current = '';
      interimUserTextRef.current = '';
      setLiveUserText('');
      setLiveAiText('');
    }
  }, [isLiveActive, setCallState]);

  // Disconnect active live session on switching session / starting new chat
  useEffect(() => {
    const unsubscribe = registerSessionSwitchHandler(() => {
      stopLiveSession(true);
    });
    return unsubscribe;
  }, [registerSessionSwitchHandler, stopLiveSession]);

  const handleStartCall = () => {
    setIsMuted(false);
    startLiveSession();
  };

  const handleEndCall = () => {
    stopLiveSession();
  };

  // Main Coordinator: Trigger AI response for text chat messages
  useEffect(() => {
    const getAIResponse = async () => {
      if (messages.length === 0) return;

      const lastMessage = messages[messages.length - 1];
      // Only respond to user messages not from live call, and only if not already processing
      if (lastMessage.sender !== 'user' || processingRef.current) return;
      // Don't trigger text AI responses during a live voice call
      if (isLiveActive) return;

      processingRef.current = true;
      setAiResponding(true);
      setError(null);

      try {
        let replyText = '';

        if (settings.isMockMode) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          replyText = getMockReply(lastMessage.text);
        } else {
          const historyPayload = messages
            .slice(0, -1)
            .map(m => ({ sender: m.sender, text: m.text }));
          replyText = await generateResponse(settings.apiKey, lastMessage.text, historyPayload);
        }

        await addMessage('assistant', replyText);
      } catch (err: any) {
        setError(err.message || 'Error generating response.');
      } finally {
        setAiResponding(false);
        processingRef.current = false;
      }
    };

    getAIResponse();
  }, [messages, isLiveActive, settings.isMockMode, settings.apiKey]);

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>

      {/* Sidebar Panel */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onOpenLogin={() => setIsLoginOpen(true)}
      />

      {/* Main Content Area */}
      <ChatWindow 
        onStartCall={handleStartCall}
        onEndCall={handleEndCall}
        aiResponding={aiResponding}
        isMuted={isMuted}
        onMuteToggle={() => setIsMuted(m => !m)}
        isCallActive={isLiveActive}
        liveUserText={liveUserText}
        liveAiText={liveAiText}
        onOpenLogin={() => setIsLoginOpen(true)}
        userAnalyser={userAnalyser}
        aiAnalyser={aiAnalyser}
      />

      {/* Global Error Banner */}
      {error && (
        <div className="error-banner glass-panel animate-fade-in">
          <AlertCircle size={16} className="error-icon-banner" />
          <span className="error-message-text">{error}</span>
          <button className="error-close-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Global Login Modal overlay */}
      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
      />
    </div>
  );
};

export default App;
