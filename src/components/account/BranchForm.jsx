import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateOwnBranch } from '../../services/userService';
import { BRANCHES } from '../../appConfig';

export default function BranchForm() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBranch(profile?.branch || '');
  }, [profile]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await updateOwnBranch(user.uid, branch);
      await refreshProfile();
      setMessage(t('account.branchUpdated'));
    } catch (err) {
      setError(err.message || t('account.errorBranch'));
    } finally {
      setSaving(false);
    }
  }

  if (BRANCHES.length === 0) return null;

  return (
    <form className="item-form" onSubmit={handleSubmit}>
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
      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? t('account.saving') : t('account.saveBranch')}
      </button>
    </form>
  );
}
