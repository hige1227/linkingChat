import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { MainLayout } from './layouts/MainLayout';
import { ChatPage } from './pages/ChatPage';
import './styles/global.css';
import './styles/chat.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    window.electronAPI.getToken().then((token: string | null) => {
      if (token) setIsLoggedIn(true);
      setChecking(false);
    });
  }, []);

  if (checking) return null;

  if (!isLoggedIn) {
    return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout onLogout={() => setIsLoggedIn(false)} />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:converseId" element={<ChatPage />} />
          <Route path="devices" element={<Dashboard onLogout={() => setIsLoggedIn(false)} />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
