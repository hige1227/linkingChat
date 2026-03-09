import { useState, type FormEvent } from 'react';

interface ForgotPasswordProps {
  onBack: () => void;
  onCodeSent: (email: string) => void;
}

const API_BASE = 'http://localhost:3008';

export function ForgotPassword({ onBack, onCodeSent }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send reset code');
      }

      onCodeSent(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h1>Reset Password</h1>
      <p className="login-subtitle">Enter your email to receive a reset code</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Code'}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={onBack}
          style={{ marginTop: '1rem', width: '100%', background: 'none', border: 'none', color: '#4361ee', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          Back to Login
        </button>
      </form>
    </div>
  );
}
