import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  ChevronLeft, 
  Menu, 
  Edit2, 
  Check, 
  X,
  Sparkles,
  Search,
  LogOut,
  LogIn,
  User as UserIcon
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpenLogin: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen, onOpenLogin }) => {
  const { 
    sessions, 
    activeSessionId, 
    selectSession, 
    deleteSession, 
    renameSession, 
    resetToNewChat,
    clearHistory,
    settings,
    user,
    logout
  } = useApp();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close the popover when clicking outside the footer area
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const handleStartEdit = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = async (id: string, e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      await renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat session?")) {
      await deleteSession(id);
    }
  };

  const handleClearAll = () => {
    if (confirm("This will permanently delete all your conversation history. Are you sure?")) {
      clearHistory();
      setShowUserMenu(false);
    }
  };

  const handleNewChat = () => {
    // Only clear local state — no DB write until the user actually sends a message
    resetToNewChat();
    // Close sidebar on mobile screens
    if (window.innerWidth <= 768) {
      setIsOpen(false);
    }
  };

  // Filter sessions based on search queries
  const filteredSessions = sessions.filter(session => 
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Mobile top navigation bar */}
      <div className="mobile-header glass-panel">
        <button className="icon-btn" onClick={() => setIsOpen(true)}>
          <Menu size={20} />
        </button>
        <span className="mobile-title">
          AskMe <Sparkles size={14} className="sparkle-icon" />
        </span>
        <button className="icon-btn" onClick={handleNewChat}>
          <Plus size={20} />
        </button>
      </div>

      {/* Sidebar background overlay for mobile screens */}
      <div 
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`} 
        onClick={() => setIsOpen(false)} 
      />

      {/* Collapsible Sidebar Container */}
      <aside className={`sidebar-container glass-panel ${isOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          {isOpen && (
            <div className="logo">
              <Sparkles className="logo-sparkle" size={20} />
              <span>AskMe</span>
              {settings.isMockMode && <span className="badge-mock">Mock</span>}
            </div>
          )}
          <button 
            className="collapse-toggle-btn"
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* New Chat Button */}
        <button className="new-chat-btn-gemini" onClick={handleNewChat}>
          <Plus size={20} />
          {isOpen && <span>New chat</span>}
        </button>

        {/* Show Search & Recent Chats only when expanded */}
        {isOpen && (
          <>
            {/* Search Input */}
            <div className="sidebar-search-container">
              <Search size={16} className="search-icon-sidebar" />
              <input 
                type="text" 
                placeholder="Search chats..." 
                className="sidebar-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Chronological Chat List */}
            <div className="sessions-list-wrapper">
              <div className="section-label">Recents</div>
              
              {filteredSessions.length === 0 ? (
                <div className="empty-history">
                  <MessageSquare size={20} className="empty-icon" />
                  <p>{searchQuery ? 'No search results' : 'No recent chats'}</p>
                </div>
              ) : (
                <div className="sessions-list">
                  {filteredSessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isEditing = session.id === editingId;

                    return (
                      <div
                        key={session.id}
                        className={`session-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          selectSession(session.id);
                          if (window.innerWidth <= 768) setIsOpen(false);
                        }}
                      >
                        <MessageSquare size={16} className="chat-icon" />
                        
                        {isEditing ? (
                          <form className="edit-form" onSubmit={(e) => handleSaveEdit(session.id, e)}>
                            <input
                              type="text"
                              className="edit-input"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button 
                              type="button" 
                              className="edit-action-btn check" 
                              onClick={(e) => handleSaveEdit(session.id, e)}
                            >
                              <Check size={12} />
                            </button>
                            <button 
                              type="button" 
                              className="edit-action-btn cancel" 
                              onClick={handleCancelEdit}
                            >
                              <X size={12} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <span className="session-title">{session.title}</span>
                            <div className="session-actions">
                              <button
                                className="action-btn"
                                onClick={(e) => handleStartEdit(session.id, session.title, e)}
                                title="Rename chat"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                className="action-btn delete"
                                onClick={(e) => handleDelete(session.id, e)}
                                title="Delete chat"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Sidebar Footer - User Profile and Sign out menu */}
        <div className="sidebar-footer-gemini" ref={userMenuRef}>
          {/* User Popover Menu */}
          {showUserMenu && (
            <div className="user-popover-menu glass-panel animate-slide-up">
              {sessions.length > 0 && (
                <button className="popover-item danger" onClick={handleClearAll}>
                  <Trash2 size={15} />
                  <span>Clear All History</span>
                </button>
              )}
              {user ? (
                <button className="popover-item" onClick={() => { logout(); setShowUserMenu(false); }}>
                  <LogOut size={15} />
                  <span>Log out</span>
                </button>
              ) : (
                <button className="popover-item" onClick={() => { onOpenLogin(); setShowUserMenu(false); }}>
                  <LogIn size={15} />
                  <span>Log in</span>
                </button>
              )}
            </div>
          )}

          {/* User Card */}
          {user ? (
            <div className="user-profile-card" onClick={() => setShowUserMenu(!showUserMenu)}>
              {!avatarError && user.avatar ? (
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="user-avatar-image" 
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="avatar-initials-fallback">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="user-text-info">
                <span className="username-label">{user.name}</span>
              </div>
            </div>
          ) : (
            <div className="user-profile-card logged-out" onClick={onOpenLogin}>
              <div className="avatar-placeholder">
                <UserIcon size={16} />
              </div>
              <div className="user-text-info">
                <span className="username-label">Log in to AskMe</span>
                <span className="userplan-label">Start voice calls</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
