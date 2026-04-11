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
      setError(result.error || (isRegister ? 'Registration failed' : 'Login failed'));
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
      <p className="login-subtitle">Desktop Client</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
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
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="letters, numbers, underscores"
                required
                minLength={3}
                maxLength={30}
              />
            </div>
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                required
              />
            </div>
          </>
        )}
        <div className="form-group">
          <label htmlFor="password">Password</label>
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
            ? (isRegister ? 'Registering...' : 'Logging in...')
            : (isRegister ? 'Register' : 'Login')
          }
        </button>
        <button
          type="button"
          onClick={switchMode}
          style={{ marginTop: '0.75rem', width: '100%', background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
        </button>
        {!isRegister && (
          <button
            type="button"
            onClick={onForgotPassword}
            style={{ marginTop: '0.25rem', width: '100%', background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Forgot password?
          </button>
        )}
      </form>
    </div>
  );
}
