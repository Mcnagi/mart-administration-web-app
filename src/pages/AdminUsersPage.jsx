import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as userService from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AdminUsersPage() {
  const { profile: currentProfile } = useAuth();
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
    refresh().catch((err) => setError(err.message || 'Failed to load users.'));
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
      setError(err.message || 'Failed to create user.');
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
      setError(err.message || 'Failed to update admin role.');
    }
  }

  async function handleToggleDisabled(u) {
    setError('');
    try {
      await userService.setDisabled(u.uid, !u.disabled);
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to update user.');
    }
  }

  async function handleRevoke(u) {
    if (!confirm(`Remove ${u.email}'s access? This cannot be undone from here.`)) return;
    setError('');
    try {
      await userService.revokeUser(u.uid);
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to remove user.');
    }
  }

  if (users === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <h2>Manage users</h2>

      <form className="item-form" onSubmit={handleCreate}>
        <label>
          New user email
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={creating}>
          {creating ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {createdCredential && (
        <div className="callout">
          Account created for <strong>{createdCredential.email}</strong>.
          <br />
          Temporary password: <code>{createdCredential.tempPassword}</code>
          <br />
          Share this with them now — it will not be shown again. They should change it after logging in.
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <ul className="user-list">
        {users.map((u) => (
          <li key={u.uid} className="user-row">
            <div className="user-row-info">
              <span className="user-email">{u.email}</span>
              <span className={`badge ${u.role === 'admin' ? 'badge-ok' : 'badge-none'}`}>
                {u.role === 'admin' ? 'Admin' : 'User'}
              </span>
              {u.branch && <span className="badge badge-none">{u.branch}</span>}
              {u.disabled && <span className="badge badge-expired">Disabled</span>}
            </div>
            <div className="user-row-actions">
              <button className="btn-link" onClick={() => handleToggleAdmin(u)}>
                {u.role === 'admin' ? 'Demote' : 'Make admin'}
              </button>
              <button className="btn-link" onClick={() => handleToggleDisabled(u)}>
                {u.disabled ? 'Enable' : 'Disable'}
              </button>
              <button
                className="btn-link btn-link-danger"
                onClick={() => handleRevoke(u)}
                disabled={u.uid === currentProfile.uid}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
