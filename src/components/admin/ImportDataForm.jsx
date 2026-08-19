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

  async function handleUpload() {
    if (!parsed) return;
    setImportError('');
    setUploading(true);
    try {
      const { imported } = await uploadParsedRows(parsed.rows);
      setImportSummary({ imported, skipped: parsed.skipped });
      setParsed(null);
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
    if (importInputRef.current) importInputRef.current.value = '';
  }

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
          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={handleUpload} disabled={uploading}>
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
