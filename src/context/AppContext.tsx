import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSupabase } from '../utils/supabase';

export interface ChatSession {
  id: string;
  user_email?: string | null;
  title: string;
  created_at: string;
}

export interface ChatMessage {
  id?: string;
  session_id: string;
  sender: 'user' | 'assistant';
  text: string;
  created_at: string;
}

export interface AppSettings {
  apiKey: string;
  isMockMode: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  voiceName: string;
  speechRate: number;
  speechPitch: number;
}

export type CallStatus = 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking';

export interface CallState {
  isActive: boolean;
  status: CallStatus;
  liveTranscript: string;
}

interface AppContextType {
  sessions: ChatSession[];
  messages: ChatMessage[];
  activeSessionId: string | null;
  settings: AppSettings;
  callState: CallState;
  loading: boolean;
  error: string | null;
  user: { name: string; email: string; avatar: string } | null;
  saveSettings: (newSettings: AppSettings) => void;
  createNewSession: (title?: string) => Promise<string>;
  resetToNewChat: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, newTitle: string) => Promise<void>;
  addMessage: (sender: 'user' | 'assistant', text: string) => Promise<void>;
  addMessagesBulk: (messagesToAdd: { sender: 'user' | 'assistant', text: string }[]) => Promise<void>;
  setCallState: React.Dispatch<React.SetStateAction<CallState>>;
  setError: (err: string | null) => void;
  clearHistory: () => Promise<void>;
  login: () => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: (import.meta.env.VITE_GEMINI_API_KEY as string) || '',
  isMockMode: (import.meta.env.VITE_USE_GEMINI_API as string) !== 'true',
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string) || '',
  supabaseKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '',
  voiceName: '',
  speechRate: 1.0,
  speechPitch: 1.0,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('askme_settings');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      ...DEFAULT_SETTINGS,
      voiceName: parsed.voiceName || '',
      speechRate: parsed.speechRate !== undefined ? parsed.speechRate : 1.0,
      speechPitch: parsed.speechPitch !== undefined ? parsed.speechPitch : 1.0,
      // Keep credentials locked to the .env file
      apiKey: DEFAULT_SETTINGS.apiKey,
      isMockMode: DEFAULT_SETTINGS.isMockMode,
      supabaseUrl: DEFAULT_SETTINGS.supabaseUrl,
      supabaseKey: DEFAULT_SETTINGS.supabaseKey,
    };
  });

  // Mock Authentication State (starts as null or loaded from LocalStorage)
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(() => {
    const saved = localStorage.getItem('askme_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Initialize activeSessionId synchronously to prevent race conditions on page reload
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const savedUser = localStorage.getItem('askme_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      return localStorage.getItem(`askme_active_session_${parsed.email}`);
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    status: 'disconnected',
    liveTranscript: '',
  });

  // Fetch Supabase client dynamically based on settings
  const supabase = getSupabase(settings.supabaseUrl, settings.supabaseKey);



  // Listen to message events from mock Google Auth popup window
  useEffect(() => {
    const handlePopupMessage = (event: MessageEvent) => {
      console.log("[AppContext Listener] Received message event:", event);
      
      // Validate origin
      if (event.origin !== window.location.origin) {
        console.warn("[AppContext Listener] Origin mismatch. Message origin:", event.origin, "App origin:", window.location.origin);
        return;
      }
      
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        console.log("[AppContext Listener] Login successful! Setting user profile payload:", event.data);
        const userData = {
          name: event.data.name,
          email: event.data.email,
          avatar: event.data.avatar,
        };
        setUser(userData);
        localStorage.setItem('askme_user', JSON.stringify(userData));
      } else {
        console.log("[AppContext Listener] Ignored message type:", event.data?.type);
      }
    };
    
    window.addEventListener('message', handlePopupMessage);
    return () => {
      window.removeEventListener('message', handlePopupMessage);
    };
  }, []);

  const login = async () => {
    // Handled directly by Google OAuth popup inside LoginModal.tsx
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('askme_user');
  };

  // Save settings to LocalStorage
  const saveSettings = (newSettings: AppSettings) => {
    setSettingsState(newSettings);
    localStorage.setItem('askme_settings', JSON.stringify(newSettings));
  };

  // Sync activeSessionId to localStorage when it changes so it survives page reload
  useEffect(() => {
    if (user) {
      if (activeSessionId) {
        localStorage.setItem(`askme_active_session_${user.email}`, activeSessionId);
      } else {
        localStorage.removeItem(`askme_active_session_${user.email}`);
      }
    }
  }, [activeSessionId, user]);

  // Sync / Load sessions on startup or when Database keys/user state change
  useEffect(() => {
    const loadSessions = async () => {
      // Require login — do not load guest sessions
      if (!user) {
        setSessions([]);
        setMessages([]);
        setActiveSessionId(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const email = user.email;
        if (supabase) {
          // Cloud Supabase: Query user's single row
          const { data, error: dbErr } = await supabase
            .from('sessions')
            .select('titles')
            .eq('user_email', email)
            .maybeSingle();

          if (dbErr) throw dbErr;

          if (!data) {
            // Create a blank row for new user
            await supabase.from('sessions').insert({ user_email: email, titles: [] });
            setSessions([]);
          } else {
            const formatted = data.titles.map((t: string) => ({
              id: t,
              title: t,
              created_at: new Date().toISOString()
            }));
            setSessions(formatted);
          }
        } else {
          // LocalStorage fallback
          const localSess = localStorage.getItem(`askme_sessions_${email}`);
          const titles = localSess ? JSON.parse(localSess) : [];
          const formatted = titles.map((t: string) => ({
            id: t,
            title: t,
            created_at: new Date().toISOString()
          }));
          setSessions(formatted);
        }
      } catch (err: any) {
        console.error('Error loading sessions:', err);
        setError(`Failed to load sessions: ${err.message}. Defaulting to Local Mode.`);
        // LocalStorage fallback on error
        const email = user ? user.email : 'guest_local';
        const localSess = localStorage.getItem(`askme_sessions_${email}`);
        const titles = localSess ? JSON.parse(localSess) : [];
        const formatted = titles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));
        setSessions(formatted);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [settings.supabaseUrl, settings.supabaseKey, user]);

  // Load messages whenever active session changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!activeSessionId) {
        setMessages([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const email = user ? user.email : 'guest_local';
        if (supabase) {
          // Fetch from Supabase: Get messages array from single row
          const { data, error: dbErr } = await supabase
            .from('messages')
            .select('messages')
            .eq('user_email', email)
            .eq('chat_title', activeSessionId)
            .maybeSingle();

          if (dbErr) throw dbErr;
          setMessages(data ? data.messages : []);
        } else {
          // Fetch from LocalStorage
          const localMsgs = localStorage.getItem(`askme_msgs_${email}_${activeSessionId}`);
          setMessages(localMsgs ? JSON.parse(localMsgs) : []);
        }
      } catch (err: any) {
        console.error('Error loading messages:', err);
        setError('Failed to load conversation history.');
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [activeSessionId, settings.supabaseUrl, settings.supabaseKey]);

  // Create a new session
  // Reset the view to a blank new chat WITHOUT persisting anything to DB.
  // A real session is created lazily on the first addMessage() call.
  const resetToNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
  };

  const createNewSession = async (title: string = 'New Conversation'): Promise<string> => {
    setError(null);
    try {
      const email = user ? user.email : 'guest_local';
      
      if (supabase) {
        // 1. Fetch current titles array
        const { data } = await supabase
          .from('sessions')
          .select('titles')
          .eq('user_email', email)
          .maybeSingle();
        
        const currentTitles = data ? data.titles : [];
        const updatedTitles = [title, ...currentTitles];

        // 2. Upsert the updated titles array
        const { error: dbErr } = await supabase
          .from('sessions')
          .upsert({ user_email: email, titles: updatedTitles });

        if (dbErr) throw dbErr;

        // 3. Create empty entry in messages table
        await supabase
          .from('messages')
          .insert({ user_email: email, chat_title: title, messages: [] });

        const formatted = updatedTitles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));
        
        setSessions(formatted);
        setActiveSessionId(title);
        return title;
      } else {
        // Insert in LocalStorage
        const localSess = localStorage.getItem(`askme_sessions_${email}`);
        const titles = localSess ? JSON.parse(localSess) : [];
        const updatedTitles = [title, ...titles];
        localStorage.setItem(`askme_sessions_${email}`, JSON.stringify(updatedTitles));

        const formatted = updatedTitles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));

        setSessions(formatted);
        localStorage.setItem(`askme_msgs_${email}_${title}`, JSON.stringify([]));
        setActiveSessionId(title);
        return title;
      }
    } catch (err: any) {
      console.error('Error creating session:', err);
      setError('Could not create new session.');
      throw err;
    }
  };

  // Select a session
  const selectSession = (id: string) => {
    setActiveSessionId(id);
  };

  // Delete a session
  const deleteSession = async (id: string) => {
    setError(null);
    try {
      const email = user ? user.email : 'guest_local';
      if (supabase) {
        // 1. Fetch current titles
        const { data } = await supabase
          .from('sessions')
          .select('titles')
          .eq('user_email', email)
          .maybeSingle();
        
        const currentTitles = data ? data.titles : [];
        const updatedTitles = (currentTitles as string[]).filter((t: string) => t !== id);

        // 2. Update sessions
        await supabase
          .from('sessions')
          .upsert({ user_email: email, titles: updatedTitles });

        // 3. Delete messages entry
        await supabase
          .from('messages')
          .delete()
          .eq('user_email', email)
          .eq('chat_title', id);

        const formatted = updatedTitles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));
        setSessions(formatted);
      } else {
        const localSess = localStorage.getItem(`askme_sessions_${email}`);
        const titles = localSess ? JSON.parse(localSess) : [];
        const updatedTitles = titles.filter((t: string) => t !== id);
        localStorage.setItem(`askme_sessions_${email}`, JSON.stringify(updatedTitles));
        localStorage.removeItem(`askme_msgs_${email}_${id}`);

        const formatted = updatedTitles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));
        setSessions(formatted);
      }

      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      console.error('Error deleting session:', err);
      setError('Could not delete conversation.');
    }
  };

  // Rename a session
  const renameSession = async (id: string, newTitle: string) => {
    setError(null);
    try {
      const email = user ? user.email : 'guest_local';
      if (supabase) {
        // 1. Fetch current titles
        const { data } = await supabase
          .from('sessions')
          .select('titles')
          .eq('user_email', email)
          .maybeSingle();
        
        const currentTitles = data ? data.titles : [];
        const updatedTitles = (currentTitles as string[]).map((t: string) => t === id ? newTitle : t);

        // 2. Update sessions list
        await supabase
          .from('sessions')
          .upsert({ user_email: email, titles: updatedTitles });

        // 3. Move messages to new title and delete old
        const { data: msgData } = await supabase
          .from('messages')
          .select('messages')
          .eq('user_email', email)
          .eq('chat_title', id)
          .maybeSingle();
        
        const currentMsgs = msgData ? msgData.messages : [];

        await supabase
          .from('messages')
          .delete()
          .eq('user_email', email)
          .eq('chat_title', id);

        await supabase
          .from('messages')
          .insert({ user_email: email, chat_title: newTitle, messages: currentMsgs });

        const formatted = updatedTitles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));
        setSessions(formatted);
      } else {
        const localSess = localStorage.getItem(`askme_sessions_${email}`);
        const titles = localSess ? JSON.parse(localSess) : [];
        const updatedTitles = titles.map((t: string) => t === id ? newTitle : t);
        localStorage.setItem(`askme_sessions_${email}`, JSON.stringify(updatedTitles));

        const localMsgs = localStorage.getItem(`askme_msgs_${email}_${id}`);
        localStorage.setItem(`askme_msgs_${email}_${newTitle}`, localMsgs || '[]');
        localStorage.removeItem(`askme_msgs_${email}_${id}`);

        const formatted = updatedTitles.map((t: string) => ({
          id: t,
          title: t,
          created_at: new Date().toISOString()
        }));
        setSessions(formatted);
      }

      if (activeSessionId === id) {
        setActiveSessionId(newTitle);
      }
    } catch (err: any) {
      console.error('Error renaming session:', err);
      setError('Could not rename conversation.');
    }
  };

  // Add message to active session
  const addMessage = async (sender: 'user' | 'assistant', text: string) => {
    let currentSessionId = activeSessionId;
    
    // Auto-create a session if none is active
    if (!currentSessionId) {
      const summary = text.length > 25 ? text.substring(0, 25) + '...' : text;
      currentSessionId = await createNewSession(summary);
    }

    try {
      const email = user ? user.email : 'guest_local';
      const newMsgObj = {
        sender,
        text,
        created_at: new Date().toISOString(),
      };

      if (supabase) {
        // Fetch, append, and upsert messages list
        const { data } = await supabase
          .from('messages')
          .select('messages')
          .eq('user_email', email)
          .eq('chat_title', currentSessionId)
          .maybeSingle();

        const currentMsgs = data ? data.messages : [];
        const updatedMsgs = [...currentMsgs, newMsgObj];

        const { error: dbErr } = await supabase
          .from('messages')
          .upsert({ user_email: email, chat_title: currentSessionId, messages: updatedMsgs });

        if (dbErr) throw dbErr;
        setMessages(updatedMsgs);
      } else {
        const localMsgs = localStorage.getItem(`askme_msgs_${email}_${currentSessionId}`) || '[]';
        const parsed = JSON.parse(localMsgs);
        const updated = [...parsed, newMsgObj];
        
        localStorage.setItem(`askme_msgs_${email}_${currentSessionId}`, JSON.stringify(updated));
        setMessages(updated);
      }

      // Automatically rename session from default title if this was the first message
      const activeSess = sessions.find((s) => s.id === currentSessionId);
      if (activeSess && activeSess.title === 'New Conversation' && sender === 'user') {
        const summary = text.length > 25 ? text.substring(0, 25) + '...' : text;
        await renameSession(currentSessionId, summary);
      }
    } catch (err: any) {
      console.error('Error adding message:', err);
      setError('Could not send message.');
    }
  };

  // Bulk save voice chat messages
  const addMessagesBulk = async (messagesToAdd: { sender: 'user' | 'assistant', text: string }[]) => {
    if (messagesToAdd.length === 0) return;
    
    let currentSessionId = activeSessionId;
    
    // Auto-create a session if none is active using the first user message
    if (!currentSessionId) {
      const firstUserMsg = messagesToAdd.find(m => m.sender === 'user') || messagesToAdd[0];
      const summary = firstUserMsg.text.length > 25 ? firstUserMsg.text.substring(0, 25) + '...' : firstUserMsg.text;
      currentSessionId = await createNewSession(summary);
    }

    try {
      const email = user ? user.email : 'guest_local';
      
      const newMsgObjects = messagesToAdd.map(msg => ({
        sender: msg.sender,
        text: msg.text,
        created_at: new Date().toISOString(),
      }));

      let finalMsgs = [];

      if (supabase) {
        // Fetch current messages list
        const { data } = await supabase
          .from('messages')
          .select('messages')
          .eq('user_email', email)
          .eq('chat_title', currentSessionId)
          .maybeSingle();

        const currentMsgs = data ? data.messages : [];
        finalMsgs = [...currentMsgs, ...newMsgObjects];

        const { error: dbErr } = await supabase
          .from('messages')
          .upsert({ user_email: email, chat_title: currentSessionId, messages: finalMsgs });

        if (dbErr) throw dbErr;
        setMessages(finalMsgs);
      } else {
        const localMsgs = localStorage.getItem(`askme_msgs_${email}_${currentSessionId}`) || '[]';
        const parsed = JSON.parse(localMsgs);
        finalMsgs = [...parsed, ...newMsgObjects];
        
        localStorage.setItem(`askme_msgs_${email}_${currentSessionId}`, JSON.stringify(finalMsgs));
        setMessages(finalMsgs);
      }

      // Automatically rename session from default title if this was a new session
      const activeSess = sessions.find((s) => s.id === currentSessionId);
      if (activeSess && activeSess.title === 'New Conversation') {
        const firstUserMsg = messagesToAdd.find(m => m.sender === 'user') || messagesToAdd[0];
        const summary = firstUserMsg.text.length > 25 ? firstUserMsg.text.substring(0, 25) + '...' : firstUserMsg.text;
        await renameSession(currentSessionId, summary);
      }
    } catch (err: any) {
      console.error('Error adding messages bulk:', err);
      setError('Could not save conversation history.');
    }
  };

  // Clear all chats (reset db)
  const clearHistory = async () => {
    setLoading(true);
    try {
      const email = user ? user.email : 'guest_local';
      if (supabase) {
        // Clear Supabase session titles row and clear user's messages rows
        await supabase
          .from('sessions')
          .upsert({ user_email: email, titles: [] });

        const { error: dbErr } = await supabase
          .from('messages')
          .delete()
          .eq('user_email', email);

        if (dbErr) throw dbErr;
      } else {
        // Clear local storage for current user
        localStorage.setItem(`askme_sessions_${email}`, JSON.stringify([]));
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`askme_msgs_${email}_`)) {
            localStorage.removeItem(key);
            i--;
          }
        }
      }
      setSessions([]);
      setMessages([]);
      setActiveSessionId(null);
    } catch (err: any) {
      console.error('Error clearing history:', err);
      setError('Could not clear history.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        sessions,
        messages,
        activeSessionId,
        settings,
        callState,
        loading,
        error,
        saveSettings,
        createNewSession,
        resetToNewChat,
        selectSession,
        deleteSession,
        renameSession,
        addMessage,
        addMessagesBulk,
        setCallState,
        setError,
        clearHistory,
        user,
        login,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
