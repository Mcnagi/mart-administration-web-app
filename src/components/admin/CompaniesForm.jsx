import { useEffect, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { fetchCompanies, saveCompany, removeCompany } from '../../services/companyService';
import LoadingSpinner from '../LoadingSpinner';

export default function CompaniesForm() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function refresh() {
    return fetchCompanies()
      .then((list) => list.sort((a, b) => a.code - b.code))
      .then(setCompanies)
      .catch((err) => setError(err.message || t('admin.errorLoadCompanies')));
  }

  useEffect(() => {
    refresh();
  }, []);

  function resetForm() {
    setCode('');
    setName('');
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await saveCompany({ id: editingId, code, name });
      resetForm();
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorSaveCompany'));
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(company) {
    setCode(String(company.code));
    setName(company.name);
    setEditingId(company.id);
  }

  async function handleDelete(company) {
    if (!confirm(t('admin.confirmDeleteCompany', { name: company.name }))) return;
    setError('');
    try {
      await removeCompany(company.id);
      if (editingId === company.id) resetForm();
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorDeleteCompany'));
    }
  }

  return (
    <div className="item-form">
      <h3>{t('admin.companiesTitle')}</h3>
      <form className="label-inline" onSubmit={handleSubmit}>
        <label className="label-inline">
          {t('admin.companyCode')}
          <input type="number" value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} />
        </label>
        <label className="label-inline">
          {t('admin.companyName')}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy || !code || !name.trim()}>
            {editingId !== null ? t('admin.saveCompany') : t('admin.addCompany')}
          </button>
          {editingId !== null && (
            <button type="button" className="btn-link" onClick={resetForm} disabled={busy}>
              {t('admin.cancel')}
            </button>
          )}
        </div>
      </form>

      {error && <div className="form-error">{error}</div>}

      {companies === null ? (
        <LoadingSpinner />
      ) : companies.length === 0 ? (
        <p className="import-hint">{t('admin.noCompanies')}</p>
      ) : (
        <ul className="user-list">
          {companies.map((company) => (
            <li key={company.id} className="user-row">
              <div className="user-row-info">
                <span className="badge badge-none">{company.code}</span>
                <span className="user-email">{company.name}</span>
              </div>
              <div className="user-row-actions">
                <button type="button" className="btn-link" onClick={() => handleEdit(company)}>
                  {t('admin.edit')}
                </button>
                <button type="button" className="btn-link btn-link-danger" onClick={() => handleDelete(company)}>
                  {t('admin.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
