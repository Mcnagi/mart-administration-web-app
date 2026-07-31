import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../services/authService';
import { updateOwnDisplayName, updateOwnBranch, defaultDisplayNameFromEmail } from '../services/userService';
import { BRANCHES } from '../appConfig';

export default function AccountPage() {
  const { user, profile, refreshProfile } = useAuth();

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
      setNameMessage('Display name updated.');
    } catch (err) {
      setNameError(err.message || 'Failed to update display name.');
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
      setBranchMessage('Branch updated.');
    } catch (err) {
      setBranchError(err.message || 'Failed to update branch.');
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

      {BRANCHES.length > 0 && (
        <form className="item-form" onSubmit={handleBranchSubmit}>
          <label>
            Branch
            <select value={branch} onChange={(e) => setBranch(e.target.value)} required>
              <option value="" disabled>
                Select a branch
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
            {savingBranch ? 'Saving…' : 'Save branch'}
          </button>
        </form>
      )}

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
