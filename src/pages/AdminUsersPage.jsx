import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import * as userService from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';
import CreateUserForm from '../components/admin/CreateUserForm';
import ImportDataForm from '../components/admin/ImportDataForm';
import UserList from '../components/admin/UserList';

export default function AdminUsersPage() {
  const { profile: currentProfile } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    const list = await userService.listUsers();
    list.sort((a, b) => a.email.localeCompare(b.email));
    setUsers(list);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message || t('admin.errorLoadUsers')));
  }, []);

  if (users === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <h2>{t('admin.title')}</h2>

      <CreateUserForm onCreated={refresh} />

      {error && <div className="form-error">{error}</div>}

      <ImportDataForm />

      <UserList users={users} currentUid={currentProfile.uid} onChanged={refresh} />
    </div>
  );
}
