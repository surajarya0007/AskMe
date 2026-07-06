import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Sparkles, AlertCircle } from 'lucide-react';
import './LoginModal.css';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { settings, user } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close the modal automatically when a user logs in successfully
  React.useEffect(() => {
    if (user && isOpen) {
      onClose();
    }
  }, [user, isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || clientId.trim() === '' || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        throw new Error('Google Sign-in is not configured yet. Please configure VITE_GOOGLE_CLIENT_ID in your .env file.');
      }

      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const scope = "openid email profile";
      const nonce = "askme-reports-nonce";
      const state = "google-oauth-state";
      const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=id_token` +
        `&scope=${encodeURIComponent(scope)}` +
        `&nonce=${nonce}` +
        `&state=${state}`;

      const width = 500;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        oauthUrl,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
      );

      if (!popup) {
        throw new Error('Popup blocker blocked Google login window. Please enable popups in browser.');
      }

      // Monitor popup status to reset loading state when closed
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          setLoading(false);
        }
      }, 800);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to authenticate with Google.');
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="login-modal-content glass-panel animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal-header">
          <button className="login-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="login-modal-body">
          <div className="login-logo-container">
            <Sparkles className="login-logo-sparkle animate-pulse" size={40} />
            <h2 className="login-logo-text">AskMe</h2>
          </div>

          <div className="login-intro-text">
            <h3>Sign in to your account</h3>
            <p>Sync your conversation history and access your custom assistant settings across devices.</p>
          </div>

          {error && (
            <div className="login-error-box">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Google Branded Button */}
          <button 
            className="google-signin-btn" 
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? (
              <div className="login-spinner" />
            ) : (
              <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#EA4335"
                  d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.94 5.94 0 0 1 8 12.63a5.94 5.94 0 0 1 5.99-5.89 5.8 5.8 0 0 1 4.093 1.698l3.187-3.187A9.9 9.9 0 0 0 13.99 2C8.473 2 4 6.473 4 12s4.473 10 9.99 10c5.772 0 9.805-4.043 9.805-9.972 0-.675-.077-1.18-.216-1.743H12.24Z"
                />
              </svg>
            )}
            <span>{loading ? 'Connecting...' : 'Sign in with Google'}</span>
          </button>

          <p className="login-footer-disclaimer">
            {settings.supabaseUrl 
              ? 'Secured by Supabase OAuth authentication.' 
              : 'Local storage mode. Login will run a local simulation.'}
          </p>
        </div>
      </div>
    </div>
  );
};
