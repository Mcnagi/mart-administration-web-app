import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import {
  parseExcelFile,
  uploadParsedRows,
  continuePendingImport,
  getPendingRowCount,
  clearPendingRows,
  fetchExistingRows,
  filterNewRows,
  filterChangedRows,
} from '../../services/dataService';
import LoadingSpinner from '../LoadingSpinner';

const PREVIEW_ROW_COUNT = 5;

export default function ImportDataForm() {
  const { t } = useTranslation();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  // Which upload button is currently running — also doubles as the "busy"
  // flag (uploading = action !== null) so only one can run at a time.
  const [action, setAction] = useState(null);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState('');
  // Cached existing `data` rows (barcode -> fields), read once per parsed
  // file the first time either the "new only" or "update changed" button is
  // used, and shared between them — see loadExistingRows.
  const [existingRows, setExistingRows] = useState(null);
  const importInputRef = useRef(null);
  const uploading = action !== null;

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
    setExistingRows(null);
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
  // in a few smaller batches instead of one long-running call. This range
  // is the starting point for all three upload buttons below; "new only"
  // and "update changed" then filter it further once the existing rows are
  // read (see runUpload).
  function rowsInRange() {
    if (!parsed) return [];
    const start = Math.min(Math.max(0, skip), parsed.rows.length);
    const end = limit === '' ? undefined : start + Math.max(0, Number(limit) || 0);
    return parsed.rows.slice(start, end);
  }

  // Reads every row already in the `data` collection, once per parsed file,
  // so "new only" and "update changed" don't each trigger their own
  // full-collection read if the admin tries one then the other.
  async function loadExistingRows() {
    if (existingRows) return existingRows;
    const rows = await fetchExistingRows();
    setExistingRows(rows);
    return rows;
  }

  function resetAfterUpload() {
    setParsed(null);
    setSkip(0);
    setLimit('');
    setExistingRows(null);
    if (importInputRef.current) importInputRef.current.value = '';
  }

  // Shared by all three buttons below: applies `filterRows` to the
  // skip/limit range, uploads whatever's left (skipping the write entirely
  // when nothing matches), and reports the result the same way regardless
  // of which mode triggered it.
  async function runUpload(actionName, filterRows) {
    setImportError('');
    setAction(actionName);
    try {
      const rows = await filterRows(rowsInRange());
      const imported = rows.length === 0 ? 0 : (await uploadParsedRows(rows)).imported;
      setImportSummary({ imported, skipped: parsed.skipped });
      resetAfterUpload();
    } catch (err) {
      console.error(`[data import] ${actionName} upload failed`, err);
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setAction(null);
      setPendingCount(await getPendingRowCount());
    }
  }

  // Uploads only barcodes that don't exist in `data` yet — existing rows
  // are left untouched even if the file's values for them have changed.
  function handleUploadNewOnly() {
    return runUpload('newOnly', async (rows) => filterNewRows(rows, await loadExistingRows()));
  }

  // Uploads new rows plus existing rows whose fields actually differ from
  // what's stored — rows that would just re-write the same values are
  // skipped, so a re-run of an already-imported file is a cheap no-op.
  function handleUploadChanged() {
    return runUpload('update', async (rows) => filterChangedRows(rows, await loadExistingRows()));
  }

  // Uploads every row in range unconditionally, same as a plain re-import —
  // no existing-data read, no filtering.
  function handleUploadOverwrite() {
    return runUpload('overwrite', async (rows) => rows);
  }

  async function handleContinueUpload() {
    setImportError('');
    setAction('continue');
    try {
      const { imported } = await continuePendingImport();
      setImportSummary({ imported, skipped: 0 });
    } catch (err) {
      console.error('[data import] continue upload failed', err);
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setAction(null);
      setPendingCount(await getPendingRowCount());
    }
  }

  function handleCancel() {
    setParsed(null);
    setImportError('');
    setSkip(0);
    setLimit('');
    setExistingRows(null);
    if (importInputRef.current) importInputRef.current.value = '';
  }

  const rangeCount = rowsInRange().length;

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
              {action === 'continue' ? t('admin.importing') : t('admin.continueImportButton')}
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
          <p className="import-range-hint">{t('admin.importUploadRange', { count: rangeCount, total: parsed.rows.length })}</p>
          <p className="import-hint">{t('admin.importModesHint')}</p>
          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={handleUploadNewOnly} disabled={uploading || rangeCount === 0}>
              {action === 'newOnly' ? t('admin.importing') : t('admin.importNewOnlyButton')}
            </button>
            <button type="button" className="btn-primary" onClick={handleUploadChanged} disabled={uploading || rangeCount === 0}>
              {action === 'update' ? t('admin.importing') : t('admin.importUpdateButton')}
            </button>
            <button type="button" className="btn-outline" onClick={handleUploadOverwrite} disabled={uploading || rangeCount === 0}>
              {action === 'overwrite' ? t('admin.importing') : t('admin.importOverwriteButton')}
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
