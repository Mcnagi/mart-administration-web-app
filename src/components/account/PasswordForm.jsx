import { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { changePassword } from '../../services/authService';

export default function PasswordForm() {
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setMessage(t('account.passwordUpdated'));
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message || t('account.errorPassword'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <label>
        {t('account.currentPassword')}
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label>
        {t('account.newPassword')}
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={6}
          required
        />
      </label>
      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? t('account.updating') : t('account.updatePassword')}
      </button>
    </form>
  );
}
