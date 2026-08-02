import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import * as userService from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AdminUsersPage() {
  const { profile: currentProfile } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdCredential, setCreatedCredential] = useState(null);

  async function refresh() {
    const list = await userService.listUsers();
    list.sort((a, b) => a.email.localeCompare(b.email));
    setUsers(list);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message || t('admin.errorLoadUsers')));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    setCreatedCredential(null);
    try {
      const { tempPassword } = await userService.createUser(newEmail);
      setCreatedCredential({ email: newEmail.trim().toLowerCase(), tempPassword });
      setNewEmail('');
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorCreateUser'));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleAdmin(u) {
    setError('');
    try {
      await userService.setAdminRole(u.uid, u.role !== 'admin', users);
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorUpdateAdminRole'));
    }
  }

  async function handleToggleDisabled(u) {
    setError('');
    try {
      await userService.setDisabled(u.uid, !u.disabled);
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorUpdateUser'));
    }
  }

  async function handleRevoke(u) {
    if (!confirm(t('admin.confirmRevoke', { email: u.email }))) return;
    setError('');
    try {
      await userService.revokeUser(u.uid);
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorRemoveUser'));
    }
  }

  if (users === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <h2>{t('admin.title')}</h2>

      <form className="item-form" onSubmit={handleCreate}>
        <label>
          {t('admin.newUserEmail')}
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={creating}>
          {creating ? t('admin.creating') : t('admin.createAccount')}
        </button>
      </form>

      {createdCredential && (
        <div className="callout">
          {t('admin.accountCreatedFor')} <strong>{createdCredential.email}</strong>.
          <br />
          {t('admin.tempPassword')} <code>{createdCredential.tempPassword}</code>
          <br />
          {t('admin.shareNote')}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <ul className="user-list">
        {users.map((u) => (
          <li key={u.uid} className="user-row">
            <div className="user-row-info">
              <span className="user-email">{u.email}</span>
              <span className={`badge ${u.role === 'admin' ? 'badge-ok' : 'badge-none'}`}>
                {u.role === 'admin' ? t('admin.adminBadge') : t('admin.userBadge')}
              </span>
              {u.branch && <span className="badge badge-none">{u.branch}</span>}
              {u.disabled && <span className="badge badge-expired">{t('admin.disabledBadge')}</span>}
            </div>
            <div className="user-row-actions">
              <button className="btn-link" onClick={() => handleToggleAdmin(u)}>
                {u.role === 'admin' ? t('admin.demote') : t('admin.makeAdmin')}
              </button>
              <button className="btn-link" onClick={() => handleToggleDisabled(u)}>
                {u.disabled ? t('admin.enable') : t('admin.disable')}
              </button>
              <button
                className="btn-link btn-link-danger"
                onClick={() => handleRevoke(u)}
                disabled={u.uid === currentProfile.uid}
              >
                {t('admin.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
