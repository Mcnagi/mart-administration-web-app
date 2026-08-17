import { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import * as userService from '../../services/userService';
import UserRow from './UserRow';

export default function UserList({ users, currentUid, onChanged }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  async function handleToggleAdmin(u) {
    setError('');
    try {
      await userService.setAdminRole(u.uid, u.role !== 'admin', users);
      await onChanged();
    } catch (err) {
      setError(err.message || t('admin.errorUpdateAdminRole'));
    }
  }

  async function handleToggleDisabled(u) {
    setError('');
    try {
      await userService.setDisabled(u.uid, !u.disabled);
      await onChanged();
    } catch (err) {
      setError(err.message || t('admin.errorUpdateUser'));
    }
  }

  async function handleRevoke(u) {
    if (!confirm(t('admin.confirmRevoke', { email: u.email }))) return;
    setError('');
    try {
      await userService.revokeUser(u.uid);
      await onChanged();
    } catch (err) {
      setError(err.message || t('admin.errorRemoveUser'));
    }
  }

  return (
    <>
      {error && <div className="form-error">{error}</div>}
      <ul className="user-list">
        {users.map((u) => (
          <UserRow
            key={u.uid}
            user={u}
            disableRevoke={u.uid === currentUid}
            onToggleAdmin={handleToggleAdmin}
            onToggleDisabled={handleToggleDisabled}
            onRevoke={handleRevoke}
          />
        ))}
      </ul>
    </>
  );
}
