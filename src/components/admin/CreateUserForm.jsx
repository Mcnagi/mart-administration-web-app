import { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import * as userService from '../../services/userService';

export default function CreateUserForm({ onCreated }) {
  const { t } = useTranslation();
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdCredential, setCreatedCredential] = useState(null);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    setCreatedCredential(null);
    try {
      const { tempPassword } = await userService.createUser(newEmail);
      setCreatedCredential({ email: newEmail.trim().toLowerCase(), tempPassword });
      setNewEmail('');
      await onCreated();
    } catch (err) {
      setError(err.message || t('admin.errorCreateUser'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <form className="item-form" onSubmit={handleSubmit}>
        <label>
          {t('admin.newUserEmail')}
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
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
    </>
  );
}
