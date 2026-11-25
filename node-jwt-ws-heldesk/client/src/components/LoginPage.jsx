import { useState } from 'react';

export default function LoginPage({ onSubmit }) {
  const [values, setValues] = useState({ username: '', password: '', role: 'manager' });
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = event => {
    setValues(current => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submit = async event => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(mode === 'register'
        ? { ...values, full_name: fullName, email }
        : values, mode);
    } catch (submitError) {
      setError(submitError.message || 'Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <a className="brand" href="/" aria-label="Helpdesk home">
        <span className="brand-mark">H</span>
        <span>helpdesk<span className="brand-period">.</span></span>
      </a>
      <div className="login-layout">
        <section className="login-welcome">
          <p className="eyebrow">CUSTOMER OPERATIONS</p>
          <h1>Good support starts with a clear view.</h1>
          <p className="login-lead">
            Sign in to manage your customers, team, and support tickets in one workspace.
          </p>
          <div className="login-points">
            <p><span>01</span> Raise and track support requests</p>
            <p><span>02</span> Keep every ticket conversation together</p>
            <p><span>03</span> Follow work through resolution</p>
          </div>
        </section>
        <section className="login-card">
          <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p>
          <h2>{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h2>
          <form onSubmit={submit}>
            {mode === 'login' && (
              <>
                <label htmlFor="login-role">Account type</label>
                <select id="login-role" name="role" value={values.role} onChange={update}>
                  <option value="manager">Manager</option>
                  <option value="agent">Agent</option>
                  <option value="customer">Customer</option>
                </select>
              </>
            )}

            {mode === 'register' && (
              <>
                <label htmlFor="register-role">Create account as</label>
                <select id="register-role" name="role" value={values.role} onChange={update}>
                  <option value="customer">Customer</option>
                  <option value="agent">Agent</option>
                </select>
                <label htmlFor="register-name">Full name</label>
                <input id="register-name" value={fullName} onChange={event => setFullName(event.target.value)} required maxLength={120} />
                <label htmlFor="register-email">Email address</label>
                <input id="register-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={190} />
              </>
            )}

            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              name="username"
              autoComplete="username"
              placeholder="Enter your username"
              value={values.username}
              onChange={update}
              minLength={mode === 'register' ? 3 : undefined}
              maxLength={32}
              required
            />

            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
              value={values.password}
              onChange={update}
              minLength={mode === 'register' ? 8 : undefined}
              maxLength={128}
              required
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="button-primary" disabled={submitting}>
              {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="login-footnote">
            {mode === 'login' ? 'New to the helpdesk? ' : 'Already have an account? '}
            <button type="button" className="text-button" onClick={() => {
              setError('');
              setMode(current => current === 'login' ? 'register' : 'login');
              setValues(current => ({ ...current, role: current.role === 'manager' ? 'customer' : current.role }));
            }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
