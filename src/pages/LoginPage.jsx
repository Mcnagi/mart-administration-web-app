import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { login } from '../services/authService';
import { APP_NAME } from '../appConfig';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || t('login.errorFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <LanguageSwitcher className="auth-lang-select" />
        <h1>{APP_NAME}</h1>
        <p className="auth-subtitle">{t('login.subtitle')}</p>
        <label>
          {t('login.email')}
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          {t('login.password')}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? t('login.signingIn') : t('login.loginButton')}
        </button>
        <p className="auth-note">{t('login.note')}</p>
      </form>
    </div>
  );
}
