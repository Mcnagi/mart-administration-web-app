import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateOwnDisplayName, defaultDisplayNameFromEmail } from '../../services/userService';

export default function DisplayNameForm() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || defaultDisplayNameFromEmail(profile?.email));
  }, [profile]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await updateOwnDisplayName(user.uid, displayName);
      await refreshProfile();
      setMessage(t('account.displayNameUpdated'));
    } catch (err) {
      setError(err.message || t('account.errorDisplayName'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <label>
        {t('account.displayName')}
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          required
        />
      </label>
      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? t('account.saving') : t('account.saveDisplayName')}
      </button>
    </form>
  );
}
