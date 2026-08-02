import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { changePassword } from '../services/authService';
import { updateOwnDisplayName, updateOwnBranch, defaultDisplayNameFromEmail } from '../services/userService';
import { BRANCHES } from '../appConfig';

export default function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const [displayName, setDisplayName] = useState('');
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [branch, setBranch] = useState('');
  const [branchMessage, setBranchMessage] = useState('');
  const [branchError, setBranchError] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || defaultDisplayNameFromEmail(profile?.email));
    setBranch(profile?.branch || '');
  }, [profile]);

  async function handleNameSubmit(e) {
    e.preventDefault();
    setNameError('');
    setNameMessage('');
    setSavingName(true);
    try {
      await updateOwnDisplayName(user.uid, displayName);
      await refreshProfile();
      setNameMessage(t('account.displayNameUpdated'));
    } catch (err) {
      setNameError(err.message || t('account.errorDisplayName'));
    } finally {
      setSavingName(false);
    }
  }

  async function handleBranchSubmit(e) {
    e.preventDefault();
    setBranchError('');
    setBranchMessage('');
    setSavingBranch(true);
    try {
      await updateOwnBranch(user.uid, branch);
      await refreshProfile();
      setBranchMessage(t('account.branchUpdated'));
    } catch (err) {
      setBranchError(err.message || t('account.errorBranch'));
    } finally {
      setSavingBranch(false);
    }
  }

  async function handlePasswordSubmit(e) {
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
    <div className="page">
      <h2>{t('account.title')}</h2>
      <p>
        {t('account.signedInAs')} <strong>{profile?.email}</strong> ({profile?.role})
      </p>

      <form className="item-form" onSubmit={handleNameSubmit}>
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
        {nameMessage && <div className="form-success">{nameMessage}</div>}
        {nameError && <div className="form-error">{nameError}</div>}
        <button type="submit" className="btn-primary" disabled={savingName}>
          {savingName ? t('account.saving') : t('account.saveDisplayName')}
        </button>
      </form>

      {BRANCHES.length > 0 && (
        <form className="item-form" onSubmit={handleBranchSubmit}>
          <label>
            {t('account.branch')}
            <select value={branch} onChange={(e) => setBranch(e.target.value)} required>
              <option value="" disabled>
                {t('account.selectBranch')}
              </option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {branchMessage && <div className="form-success">{branchMessage}</div>}
          {branchError && <div className="form-error">{branchError}</div>}
          <button type="submit" className="btn-primary" disabled={savingBranch}>
            {savingBranch ? t('account.saving') : t('account.saveBranch')}
          </button>
        </form>
      )}

      <form className="item-form" onSubmit={handlePasswordSubmit}>
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
    </div>
  );
}
