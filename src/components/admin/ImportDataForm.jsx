import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import {
  parseExcelFile,
  uploadParsedRows,
  continuePendingImport,
  getPendingRowCount,
  clearPendingRows,
} from '../../services/dataService';
import LoadingSpinner from '../LoadingSpinner';

const PREVIEW_ROW_COUNT = 5;

export default function ImportDataForm() {
  const { t } = useTranslation();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState('');
  const importInputRef = useRef(null);

  useEffect(() => {
    getPendingRowCount().then(setPendingCount);
  }, []);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSummary(null);
    setParsed(null);
    setSkip(0);
    setLimit('');
    // A freshly selected file replaces whatever was left over from a
    // previous, not-yet-finished import.
    await clearPendingRows();
    setPendingCount(0);
    setParsing(true);
    try {
      const result = await parseExcelFile(file);
      setParsed(result);
    } catch (err) {
      setImportError(err.message || t('admin.errorImport'));
      if (importInputRef.current) importInputRef.current.value = '';
    } finally {
      setParsing(false);
    }
  }

  // Lets the admin upload a slice of the parsed rows rather than all of
  // them at once — useful for very large files, to page through the upload
  // in a few smaller batches instead of one long-running call.
  function getRowsToUpload() {
    if (!parsed) return [];
    const start = Math.min(Math.max(0, skip), parsed.rows.length);
    const end = limit === '' ? undefined : start + Math.max(0, Number(limit) || 0);
    return parsed.rows.slice(start, end);
  }

  async function handleUpload() {
    const rows = getRowsToUpload();
    if (rows.length === 0) return;
    setImportError('');
    setUploading(true);
    try {
      const { imported } = await uploadParsedRows(rows);
      setImportSummary({ imported, skipped: parsed.skipped });
      setParsed(null);
      setSkip(0);
      setLimit('');
      if (importInputRef.current) importInputRef.current.value = '';
    } catch (err) {
      console.error('[data import] upload failed', err);
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setUploading(false);
      setPendingCount(await getPendingRowCount());
    }
  }

  async function handleContinueUpload() {
    setImportError('');
    setUploading(true);
    try {
      const { imported } = await continuePendingImport();
      setImportSummary({ imported, skipped: 0 });
    } catch (err) {
      console.error('[data import] continue upload failed', err);
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setUploading(false);
      setPendingCount(await getPendingRowCount());
    }
  }

  function handleCancel() {
    setParsed(null);
    setImportError('');
    setSkip(0);
    setLimit('');
    if (importInputRef.current) importInputRef.current.value = '';
  }

  const rowsToUpload = getRowsToUpload();

  return (
    <div className="item-form">
      <h3>{t('admin.importTitle')}</h3>
      <p className="import-hint">{t('admin.importHint')}</p>
      <label>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          onChange={handleFileChange}
          disabled={parsing || uploading}
        />
      </label>
      {parsing && <LoadingSpinner />}
      {pendingCount > 0 && !parsed && (
        <div className="callout">
          {t('admin.importPending', { remaining: pendingCount })}
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={handleContinueUpload} disabled={uploading}>
              {uploading ? t('admin.importing') : t('admin.continueImportButton')}
            </button>
          </div>
        </div>
      )}
      {parsed && (
        <div className="import-preview">
          <h4>{t('admin.previewTitle')}</h4>
          <p className="import-hint">
            {t('admin.totalRows', { total: parsed.totalRows })}
          </p>
          <div className="import-preview-table-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  {parsed.columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, PREVIEW_ROW_COUNT).map((row, i) => (
                  <tr key={i}>
                    {parsed.columns.map((c) => (
                      <td key={c.key}>{row[c.key] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-range">
            <label className="label-inline">
              {t('admin.importSkip')}
              <input
                type="number"
                min="0"
                value={skip}
                onChange={(e) => setSkip(Math.max(0, Number(e.target.value) || 0))}
                disabled={uploading}
              />
            </label>
            <label className="label-inline">
              {t('admin.importLimit')}
              <input
                type="number"
                min="0"
                placeholder={t('admin.importLimitAll')}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                disabled={uploading}
              />
            </label>
          </div>
          <p className="import-range-hint">{t('admin.importUploadRange', { count: rowsToUpload.length, total: parsed.rows.length })}</p>
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={handleUpload} disabled={uploading || rowsToUpload.length === 0}>
              {uploading ? t('admin.importing') : t('admin.importButton')}
            </button>
            <button type="button" className="btn-outline" onClick={handleCancel} disabled={uploading}>
              {t('admin.cancel')}
            </button>
          </div>
        </div>
      )}
      {importSummary && (
        <div className="callout">
          {t('admin.importSummary', {
            imported: importSummary.imported,
            skipped: importSummary.skipped,
          })}
        </div>
      )}
      {importError && <div className="form-error">{importError}</div>}
    </div>
  );
}
