import { useRef, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { parseExcelFile, uploadParsedRows } from '../../services/dataService';
import LoadingSpinner from '../LoadingSpinner';

const PREVIEW_ROW_COUNT = 5;

export default function ImportDataForm() {
  const { t } = useTranslation();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const importInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSummary(null);
    setParsed(null);
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
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setUploading(false);
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
