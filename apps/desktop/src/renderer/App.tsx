import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { MainLayout } from './layouts/MainLayout';
import { ChatPage } from './pages/ChatPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { resetClientState } from './stores/resetClientState';
import './styles/global.css';
import './styles/chat.css';
import './styles/friends.css';

type AuthView = 'login' | 'forgotPassword' | 'resetPassword';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getToken().then((token: string | null) => {
        if (token) setIsLoggedIn(true);
        setChecking(false);
      }).catch(() => {
        setChecking(false);
      });
    } else {
      // Running in browser (dev mode without Electron shell)
      setChecking(false);
    }
  }, []);

  if (checking) return null;

  const handleAuthSuccess = () => {
    resetClientState();
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    resetClientState();
    setAuthView('login');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    if (authView === 'forgotPassword') {
      return (
        <ForgotPassword
          onBack={() => setAuthView('login')}
          onCodeSent={(email) => {
            setResetEmail(email);
            setAuthView('resetPassword');
          }}
        />
      );
    }

    if (authView === 'resetPassword') {
      return (
        <ResetPassword
          email={resetEmail}
          onBack={() => setAuthView('forgotPassword')}
          onResetSuccess={() => setAuthView('login')}
        />
      );
    }

    return (
      <Login
        onLoginSuccess={handleAuthSuccess}
        onForgotPassword={() => setAuthView('forgotPassword')}
      />
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout onLogout={handleLogout} />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:converseId" element={<ChatPage />} />
          <Route path="contacts" element={<FriendsPage />} />
          <Route path="devices" element={<Dashboard onLogout={handleLogout} />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
