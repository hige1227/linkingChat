import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useChatSocket } from '../hooks/useChatSocket';

interface MainLayoutProps {
  onLogout: () => void;
}

export function MainLayout({ onLogout }: MainLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected } = useChatSocket();

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
