import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import DisplayNameForm from '../components/account/DisplayNameForm';
import BranchForm from '../components/account/BranchForm';
import PasswordForm from '../components/account/PasswordForm';

export default function AccountPage() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="page">
      <h2>{t('account.title')}</h2>
      <p>
        {t('account.signedInAs')} <strong>{profile?.email}</strong> ({profile?.role})
      </p>

      <DisplayNameForm />
      <BranchForm />
      <PasswordForm />
    </div>
  );
}
