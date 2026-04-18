import { useState, type FormEvent } from 'react';
import { API_BASE_URL } from '@renderer/config';

interface AuthResult {
  success: boolean;
  error?: string;
  user?: { id: string; username: string; displayName: string };
}

interface LoginProps {
  onLoginSuccess: () => void;
  onForgotPassword: () => void;
}

export function Login({ onLoginSuccess, onForgotPassword }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let result: AuthResult;

    if (isRegister) {
      if (window.electronAPI) {
        result = await window.electronAPI.register({ email, username, password, displayName });
      } else {
        // Browser dev mode — call API directly
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password, displayName }),
          });
          const data = await res.json();
          result = res.ok ? { success: true, user: data.user } : { success: false, error: data.message };
        } catch {
          result = { success: false, error: 'Network error' };
        }
      }
    } else {
      if (window.electronAPI) {
        result = await window.electronAPI.login(email, password);
      } else {
        try {
          const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          result = res.ok ? { success: true, user: data.user } : { success: false, error: data.message };
        } catch {
          result = { success: false, error: 'Network error' };
        }
      }
    }

    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || (isRegister ? '注册失败' : '登录失败'));
    }
    setLoading(false);
  };

  const switchMode = () => {
    setIsRegister(!isRegister);
    setError('');
  };

  return (
    <div className="login-container">
      <h1>LinkingChat</h1>
      <p className="login-subtitle">桌面客户端</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>
        {isRegister && (
          <>
            <div className="form-group">
              <label htmlFor="username">用户名</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="字母、数字、下划线"
                required
                minLength={3}
                maxLength={30}
              />
            </div>
            <div className="form-group">
              <label htmlFor="displayName">昵称</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="你的显示名称"
                required
              />
            </div>
          </>
        )}
        <div className="form-group">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            required
            minLength={isRegister ? 8 : undefined}
          />
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading
            ? (isRegister ? '注册中...' : '登录中...')
            : (isRegister ? '注册' : '登录')
          }
        </button>
        <button type="button" onClick={switchMode} className="btn-link">
          {isRegister ? '已有账号？登录' : '还没有账号？注册'}
        </button>
        {!isRegister && (
          <button type="button" onClick={onForgotPassword} className="btn-link">
            忘记密码？
          </button>
        )}
      </form>
    </div>
  );
}
