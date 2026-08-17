import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { importExcelData } from '../../services/dataService';
import LoadingSpinner from '../LoadingSpinner';

export default function ImportDataForm() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const importInputRef = useRef(null);

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSummary(null);
    setImporting(true);
    try {
      const summary = await importExcelData(file, user.uid);
      setImportSummary(summary);
    } catch (err) {
      setImportError(err.message || t('admin.errorImport'));
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  return (
    <div className="item-form">
      <h3>{t('admin.importTitle')}</h3>
      <p className="import-hint">{t('admin.importHint')}</p>
      <label>
        <input ref={importInputRef} type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing} />
      </label>
      {importing && <LoadingSpinner />}
      {importSummary && (
        <div className="callout">
          {t('admin.importSummary', {
            created: importSummary.created,
            updated: importSummary.updated,
            skipped: importSummary.skipped,
          })}
        </div>
      )}
      {importError && <div className="form-error">{importError}</div>}
    </div>
  );
}
