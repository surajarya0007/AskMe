import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { LoginModal } from './components/LoginModal';
import { useApp } from './context/AppContext';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useGemini } from './hooks/useGemini';
import { getMockReply } from './utils/mockData';
import { AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const {
    messages,
    addMessage,
    addMessagesBulk,
    settings,
    setCallState,
    error,
    setError,
    user
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
  
  const processingRef = useRef(false);

  // Initialize Gemini Live WebSocket hook
  const {
    isActive: isLiveActive,
    startLiveSession,
    stopLiveSession
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

    // Live: update user speech bubble as user speaks
    onUserTranscript: (text) => {
      setLiveUserText(text);
    },

    // Live: update AI speech bubble as AI responds
    onAiTranscript: (text) => {
      setLiveAiText(text);
    },

    // On turn complete: save both messages to DB in guaranteed correct order
    onTurnComplete: async (userText, aiText) => {
      setLiveUserText('');
      setLiveAiText('');
      try {
        const msgsToSave = [];
        if (userText) msgsToSave.push({ sender: 'user' as const, text: userText });
        if (aiText) msgsToSave.push({ sender: 'assistant' as const, text: aiText });
        if (msgsToSave.length > 0) {
          await addMessagesBulk(msgsToSave);
        }
      } catch (e) {
        console.error('[App] Failed to save voice turn:', e);
      }
    }
  });

  // Sync Live session active state with callState
  useEffect(() => {
    setCallState(prev => ({ ...prev, isActive: isLiveActive }));
    if (!isLiveActive) {
      setLiveUserText('');
      setLiveAiText('');
    }
  }, [isLiveActive, setCallState]);

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
        liveUserText={liveUserText}
        liveAiText={liveAiText}
        onOpenLogin={() => setIsLoginOpen(true)}
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
