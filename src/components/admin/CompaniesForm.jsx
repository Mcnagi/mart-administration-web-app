import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { fetchCompanies, saveCompany, removeCompany, parseCompaniesFile, uploadCompanies } from '../../services/companyService';
import LoadingSpinner from '../LoadingSpinner';

const PREVIEW_ROW_COUNT = 5;

export default function CompaniesForm() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importParsing, setImportParsing] = useState(false);
  const [importParsed, setImportParsed] = useState(null);
  const [importUploading, setImportUploading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const importInputRef = useRef(null);

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

  async function handleImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSummary(null);
    setImportParsed(null);
    setImportParsing(true);
    try {
      const result = await parseCompaniesFile(file);
      setImportParsed(result);
    } catch (err) {
      setImportError(err.message || t('admin.errorImport'));
      if (importInputRef.current) importInputRef.current.value = '';
    } finally {
      setImportParsing(false);
    }
  }

  async function handleImportConfirm() {
    if (!importParsed) return;
    setImportError('');
    setImportUploading(true);
    try {
      const { imported } = await uploadCompanies(importParsed.rows);
      setImportSummary({ imported, skipped: importParsed.skipped });
      setImportParsed(null);
      if (importInputRef.current) importInputRef.current.value = '';
      await refresh();
    } catch (err) {
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setImportUploading(false);
    }
  }

  function handleImportCancel() {
    setImportParsed(null);
    setImportError('');
    if (importInputRef.current) importInputRef.current.value = '';
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
        <ul className="user-list scroll-list">
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

      <p className="import-hint">{t('admin.companiesImportHint')}</p>
      <label>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          onChange={handleImportFileChange}
          disabled={importParsing || importUploading}
        />
      </label>
      {importParsing && <LoadingSpinner />}
      {importParsed && (
        <div className="import-preview">
          <h4>{t('admin.previewTitle')}</h4>
          <p className="import-hint">{t('admin.totalRows', { total: importParsed.totalRows })}</p>
          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>{t('admin.companyCode')}</th>
                  <th>{t('admin.companyName')}</th>
                </tr>
              </thead>
              <tbody>
                {importParsed.rows.slice(0, PREVIEW_ROW_COUNT).map((row) => (
                  <tr key={row.code}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={handleImportConfirm} disabled={importUploading}>
              {importUploading ? t('admin.importing') : t('admin.companiesImportButton')}
            </button>
            <button type="button" className="btn-outline" onClick={handleImportCancel} disabled={importUploading}>
              {t('admin.cancel')}
            </button>
          </div>
        </div>
      )}
      {importSummary && (
        <div className="callout">
          {t('admin.companiesImportSummary', { imported: importSummary.imported, skipped: importSummary.skipped })}
        </div>
      )}
      {importError && <div className="form-error">{importError}</div>}
    </div>
  );
}
