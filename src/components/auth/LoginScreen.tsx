import { useState, type FormEvent } from 'react';
import { useAuth } from '../../store/useAuth';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginScreen() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage('');

    const { error } = await signInWithMagicLink(email);
    if (error) {
      setStatus('error');
      setErrorMessage(error);
    } else {
      setStatus('sent');
    }
  }

  function handleUseDifferentEmail() {
    setStatus('idle');
    setErrorMessage('');
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-name">BADGER</span>
        </div>

        {status === 'sent' ? (
          <div className="login-success">
            <h2 className="login-heading">Check your email</h2>
            <p className="login-body">
              We sent a magic link to <strong>{email}</strong>.
            </p>
            <p className="login-body login-body--muted">
              Click the link to sign in. You can close this tab once you've followed it.
            </p>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleUseDifferentEmail}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <h2 className="login-heading">Sign in</h2>
            <p className="login-body login-body--muted">
              We'll email you a one-time link.
            </p>
            <div className="form-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                disabled={status === 'sending'}
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={status === 'sending' || !email.trim()}
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {errorMessage && (
              <p className="form-error login-error-msg">{errorMessage}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
