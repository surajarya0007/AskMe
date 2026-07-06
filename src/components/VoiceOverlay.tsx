import React from 'react';
import { useApp } from '../context/AppContext';
import { AudioWaveform } from './AudioWaveform';
import { Mic, MicOff, PhoneOff, Volume2, User, Bot, Sparkles } from 'lucide-react';
import './VoiceOverlay.css';

interface VoiceOverlayProps {
  onEndCall: () => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ 
  onEndCall, 
  isMuted, 
  setIsMuted 
}) => {
  const { callState, settings } = useApp();

  if (!callState.isActive) return null;

  const getStatusText = () => {
    switch (callState.status) {
      case 'connecting':
        return 'Connecting to AskMe...';
      case 'connected':
        return 'Connected';
      case 'listening':
        return isMuted ? 'Microphone Muted' : 'Listening... Speak now';
      case 'speaking':
        return 'AskMe is speaking';
      default:
        return 'Call active';
    }
  };

  return (
    <div className="voice-overlay glass-panel animate-fade-in">
      <div className="voice-header">
        <div className="call-info">
          <Sparkles className="sparkle-call" size={18} />
          <span>AskMe Voice Call</span>
          {settings.isMockMode && <span className="mock-badge">Mock Mode</span>}
        </div>
        <div className="connection-tag">
          <span className={`status-dot ${callState.status}`} />
          {getStatusText()}
        </div>
      </div>

      <div className="voice-main">
        {/* Pulsing Orb Visualizer */}
        <div className={`orb-container ${callState.status} ${isMuted ? 'muted' : ''}`}>
          <div className="orb-outer-ring" />
          <div className="orb-middle-ring" />
          <div className="orb-center glass-panel">
            {callState.status === 'speaking' ? (
              <Bot size={48} className="orb-icon speaking" />
            ) : (
              <User size={48} className="orb-icon user" />
            )}
          </div>
        </div>

        {/* Audio Waveform Canvas */}
        <div className="waveform-container">
          <AudioWaveform status={callState.status} isActive={callState.isActive} />
        </div>

        {/* Live Transcript Pane */}
        <div className="transcript-box glass-panel">
          {callState.liveTranscript ? (
            <p className="transcript-text text-active">
              "{callState.liveTranscript}"
            </p>
          ) : (
            <p className="transcript-text text-placeholder">
              {callState.status === 'listening' 
                ? 'Go ahead, ask me anything...' 
                : callState.status === 'connecting' 
                  ? 'Establishing secure audio session...'
                  : 'Listening for assistant reply...'}
            </p>
          )}
        </div>
      </div>

      {/* Control Buttons panel */}
      <div className="voice-controls glass-panel">
        <button 
          className={`control-btn ${isMuted ? 'active-mute' : ''} glass-button`}
          onClick={() => setIsMuted(!isMuted)}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          <span>{isMuted ? 'Unmuted' : 'Mute'}</span>
        </button>

        <button 
          className="control-btn end-call glass-button"
          onClick={onEndCall}
          title="End call"
        >
          <PhoneOff size={22} />
          <span>End Call</span>
        </button>

        <div className="settings-summary">
          <Volume2 size={16} className="text-secondary" />
          <span className="voice-name">
            {settings.voiceName ? settings.voiceName.substring(0, 18) + '...' : 'System Default'}
          </span>
        </div>
      </div>
    </div>
  );
};
