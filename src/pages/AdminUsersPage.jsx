import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import * as userService from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';
import CreateUserForm from '../components/admin/CreateUserForm';
import ImportDataForm from '../components/admin/ImportDataForm';
import ScanListTagsForm from '../components/admin/ScanListTagsForm';
import CompaniesForm from '../components/admin/CompaniesForm';
import UserList from '../components/admin/UserList';
import { scheduleIdle } from '../utils/idleSchedule';

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
    // Deferred to idle time so React StrictMode's dev-only double
    // mount/cleanup/mount can cancel the first mount's scheduled fetch
    // before it starts a real read — see utils/idleSchedule.js.
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      refresh().catch((err) => {
        if (!cancelled) setError(err.message || t('admin.errorLoadUsers'));
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  if (users === null) return <LoadingSpinner />;

  const sections = [
    { id: 'admin-import', label: t('admin.importTitle') },
    { id: 'admin-scan-tags', label: t('admin.scanListTagsTitle') },
    { id: 'admin-companies', label: t('admin.companiesTitle') },
    { id: 'admin-users', label: t('admin.usersTitle') },
    { id: 'admin-create-user', label: t('admin.createUserTitle') },
  ];

  return (
    <div className="page admin-page">
      <div className="admin-layout">
        <nav className="admin-sidebar" aria-label={t('nav.admin')}>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className="admin-sections">
          <section id="admin-import" className="admin-section">
            <ImportDataForm />
          </section>

          <section id="admin-scan-tags" className="admin-section">
            <ScanListTagsForm />
          </section>

          <section id="admin-companies" className="admin-section">
            <CompaniesForm />
          </section>

          <section id="admin-users" className="admin-section">
            <h3>{t('admin.usersTitle')}</h3>
            {error && <div className="form-error">{error}</div>}
            <UserList users={users} currentUid={currentProfile.uid} onChanged={refresh} />
          </section>

          <section id="admin-create-user" className="admin-section">
            <h3>{t('admin.createUserTitle')}</h3>
            <CreateUserForm onCreated={refresh} />
          </section>
        </div>
      </div>
    </div>
  );
}
