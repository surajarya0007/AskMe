import React, { useRef, useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { AudioWaveform } from "./AudioWaveform";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mic, MicOff, Bot, User, ArrowUp, PhoneOff } from "lucide-react";
import "./ChatWindow.css";

interface ChatWindowProps {
  onStartCall: () => void;
  onEndCall: () => void;
  aiResponding: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  isCallActive: boolean;
  liveUserText: string;
  liveAiText: string;
  onOpenLogin: () => void;
  userAnalyser?: AnalyserNode | null;
  aiAnalyser?: AnalyserNode | null;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  onStartCall,
  onEndCall,
  aiResponding,
  isMuted,
  onMuteToggle,
  isCallActive,
  liveUserText,
  liveAiText,
  onOpenLogin,
  userAnalyser,
  aiAnalyser,
}) => {
  const { messages, addMessage, loading, callState, user } = useApp();

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll when messages, live text, or loading changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveUserText, liveAiText, loading]);

  // Auto-resize input textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  if (!user) {
    return (
      <main className="chat-window-container">
        <div
          className="greeting-dashboard animate-fade-in"
          style={{ padding: "0 24px" }}
        >
          <div
            className="greeting-header-gemini"
            style={{ maxWidth: "480px", margin: "0 auto" }}
          >
            <h1 style={{ marginBottom: "16px", fontSize: "2.2rem" }}>
              Sign in to AskMe
            </h1>
            <p
              style={{
                color: "#8e918f",
                fontSize: "0.95rem",
                lineHeight: "1.6",
                marginBottom: "28px",
              }}
            >
              To start voice calls, save conversation history, and personalize
              your experience, please sign in.
            </p>
            <button
              onClick={onOpenLogin}
              style={{
                background: "var(--accent-purple)",
                color: "white",
                border: "none",
                padding: "12px 32px",
                borderRadius: "24px",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(139, 92, 246, 0.4)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 18px rgba(139, 92, 246, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow =
                  "0 4px 14px rgba(139, 92, 246, 0.4)";
              }}
            >
              Log In
            </button>
          </div>
        </div>
      </main>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loading || aiResponding) return;
    const messageText = inputText.trim();
    setInputText("");
    await addMessage("user", messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const hasContent = messages.length > 0 || isCallActive;

  // Voice status hint text
  const getVoiceHint = () => {
    if (isMuted) return "Microphone muted";
    switch (callState.status) {
      case "connecting":
        return "Connecting...";
      case "speaking":
        return "AskMe is responding...";
      case "listening":
        return "Listening — speak now";
      default:
        return "Speak now";
    }
  };

  // Render a single message bubble
  const renderBubble = (
    key: string | number,
    sender: "user" | "assistant",
    text: string,
    timestamp: string,
    isLive = false,
  ) => {
    const isUser = sender === "user";
    return (
      <div
        key={key}
        className={`message-bubble-wrapper ${isUser ? "user" : "assistant"} ${isLive ? "live-bubble" : ""}`}
      >
        {!isUser && (
          <div className="message-avatar bot glass-panel">
            <Bot size={16} />
          </div>
        )}
        <div className="message-bubble-content">
          <div className="bubble glass-panel">
            {isUser ? (
              <p className="bubble-text">{text}</p>
            ) : (
              <div className="bubble-text bubble-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {text}
                </ReactMarkdown>
              </div>
            )}
          </div>
          <span className="bubble-time">
            {isLive ? (
              <span className="live-indicator">
                <span className="live-dot" />
                Live
              </span>
            ) : (
              new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            )}
          </span>
        </div>
        {isUser && (
          <div className="message-avatar user glass-panel">
            <User size={16} />
          </div>
        )}
      </div>
    );
  };

  // The voice bar — replaces the text input when call is active
  const renderVoiceBar = () => (
    <div className="voice-bar-wrapper">
      {/* Caption above the bar — show status hint only (live text appears in bubbles) */}
      <div className="voice-bar-caption">
        <span className="voice-bar-hint">{getVoiceHint()}</span>
      </div>

      {/* Main bar: waveform + controls */}
      <div className="voice-bar-panel glass-panel">
        {/* Waveform fills the left side */}
        <div className="voice-bar-wave">
          <AudioWaveform 
            status={callState.status} 
            isActive={isCallActive} 
            userAnalyser={userAnalyser}
            aiAnalyser={aiAnalyser}
            isMuted={isMuted}
          />
        </div>

        {/* Controls on the right */}
        <div className="voice-bar-controls">
          <button
            className={`voice-bar-btn ${isMuted ? "muted" : ""}`}
            onClick={onMuteToggle}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>

          <button
            className="voice-bar-btn end-call"
            onClick={onEndCall}
            title="End call"
          >
            <PhoneOff size={18} />
            <span>End Call</span>
          </button>
        </div>
      </div>

      <p className="disclaimer-text-gemini">
        AskMe can make mistakes. Verify important info.
      </p>
    </div>
  );

  // The normal text input form
  const renderInputForm = (isCentered: boolean) => (
    <div className={`input-area-wrapper ${isCentered ? "centered" : ""}`}>
      <form
        onSubmit={handleSend}
        className="input-pill-container-gemini glass-panel"
      >
        <textarea
          ref={isCentered ? textareaRef : undefined}
          className="input-textarea-gemini"
          placeholder="Ask me anything"
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="input-controls-gemini">
          <button
            type="button"
            className="control-btn-input call-trigger"
            onClick={onStartCall}
            title="Start voice call"
          >
            <Mic size={18} />
          </button>

          {inputText.trim() && (
            <button
              type="submit"
              className="control-btn-input send-trigger animate-fade-in"
              disabled={loading || aiResponding}
              title="Send message"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
      <p className="disclaimer-text-gemini">
        AskMe can make mistakes. Verify important info.
      </p>
    </div>
  );

  return (
    <main className="chat-window-container">
      {!hasContent && !isCallActive ? (
        // Greeting empty board with centered input bar
        <div className="greeting-dashboard animate-fade-in">
          <div className="greeting-content">
            {/* Greeting heading */}
            <div className="greeting-header-gemini">
              <h1>
                {user
                  ? `Hi ${user.name.split(" ")[0]}, what's the move?`
                  : "What's the move?"}
              </h1>
            </div>

            {/* Input bar */}
            {renderInputForm(true)}
          </div>
        </div>
      ) : (
        // Active chat pane — scrollable messages + pinned bottom bar
        // Use a wrapping div (not React fragment) so flex layout is reliable
        <div className="chat-active-wrapper">
          {/* Scrollable message feed */}
          <div className="messages-scroll-wrapper">
            <div className="messages-stream">
              {/* Saved messages from DB */}
              {messages.map((msg, index) =>
                renderBubble(
                  msg.id || index,
                  msg.sender,
                  msg.text,
                  msg.created_at,
                ),
              )}

              {/* Live user speech bubble — appears while user is speaking */}
              {isCallActive &&
                liveUserText &&
                renderBubble(
                  "live-user",
                  "user",
                  liveUserText,
                  new Date().toISOString(),
                  true,
                )}

              {/* Live AI response bubble — appears while AI is responding */}
              {isCallActive &&
                liveAiText &&
                renderBubble(
                  "live-ai",
                  "assistant",
                  liveAiText,
                  new Date().toISOString(),
                  true,
                )}

              {/* Text chat typing indicator (not shown during voice) */}
              {!isCallActive && (loading || aiResponding) && (
                <div className="message-bubble-wrapper assistant">
                  <div className="message-avatar bot glass-panel">
                    <Bot size={16} />
                  </div>
                  <div className="message-bubble-content">
                    <div className="bubble glass-panel typing-indicator-bubble">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Bottom bar — pinned below scroll area, always visible */}
          {isCallActive ? renderVoiceBar() : renderInputForm(false)}
        </div>
      )}
    </main>
  );
};
