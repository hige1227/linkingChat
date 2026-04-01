import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useChatSocket } from '../hooks/useChatSocket';
import { useFriendsStore } from '../stores/friendsStore';

interface MainLayoutProps {
  onLogout: () => void;
}

export function MainLayout({ onLogout }: MainLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected } = useChatSocket();
  const pendingCount = useFriendsStore((s) => s.receivedRequests.length);
  const [aiConnected, setAiConnected] = useState(false);

  useEffect(() => {
    // Fetch initial OpenClaw status
    window.electronAPI.getOpenClawStatus().then((status) => {
      setAiConnected(status.connected);
    }).catch(() => {});

    // Listen for status changes
    window.electronAPI.onOpenClawStatusChanged((connected) => {
      setAiConnected(connected);
    });
  }, []);

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="main-layout">
      <nav className="sidebar">
        <div className="sidebar-top">
          <button
            className={`sidebar-btn ${isActive('/chat') ? 'active' : ''}`}
            onClick={() => navigate('/chat')}
            title="Chat"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </button>
          <div className="sidebar-btn-wrap">
            <button
              className={`sidebar-btn ${isActive('/contacts') ? 'active' : ''}`}
              onClick={() => navigate('/contacts')}
              title="Contacts"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </button>
            {pendingCount > 0 && <div className="sidebar-badge-dot" />}
          </div>
          <button
            className={`sidebar-btn ${isActive('/devices') ? 'active' : ''}`}
            onClick={() => navigate('/devices')}
            title="Devices"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className={`connection-dot ${isConnected ? 'online' : 'offline'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
          <div className={`connection-dot ${aiConnected ? 'online' : 'offline'}`} title={aiConnected ? 'AI Agent Connected' : 'AI Agent Offline'} />
          <button
            className="sidebar-btn logout-btn"
            onClick={async () => {
              await window.electronAPI.logout();
              onLogout();
            }}
            title="Logout"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
