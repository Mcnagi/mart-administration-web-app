import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../services/authService';
import { updateOwnDisplayName, defaultDisplayNameFromEmail } from '../services/userService';

export default function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || defaultDisplayNameFromEmail(profile?.email));
  }, [profile]);

  async function handleNameSubmit(e) {
    e.preventDefault();
    setNameError('');
    setNameMessage('');
    setSavingName(true);
    try {
      await updateOwnDisplayName(user.uid, displayName);
      await refreshProfile();
      setNameMessage('Display name updated.');
    } catch (err) {
      setNameError(err.message || 'Failed to update display name.');
    } finally {
      setSavingName(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h2>Account</h2>
      <p>
        Signed in as <strong>{profile?.email}</strong> ({profile?.role})
      </p>

      <form className="item-form" onSubmit={handleNameSubmit}>
        <label>
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        {nameMessage && <div className="form-success">{nameMessage}</div>}
        {nameError && <div className="form-error">{nameError}</div>}
        <button type="submit" className="btn-primary" disabled={savingName}>
          {savingName ? 'Saving…' : 'Save display name'}
        </button>
      </form>

      <form className="item-form" onSubmit={handlePasswordSubmit}>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label>
          New password
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
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
