import { useEffect, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { fetchConcatClassColumns, saveConcatClassColumns } from '../../services/itemListService';
import LoadingSpinner from '../LoadingSpinner';

// On/off switch for combining class1, class2 and class3 into one
// space-separated value. Saves as soon as it's toggled.
export default function ClassColumnsForm() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConcatClassColumns().then((value) => !cancelled && setEnabled(value));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(e) {
    const next = e.target.checked;
    setError('');
    setBusy(true);
    try {
      await saveConcatClassColumns(next);
      setEnabled(next);
    } catch (err) {
      setError(err.message || t('admin.errorSaveClassColumns'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-form">
      <h3>{t('admin.classColumnsTitle')}</h3>
      <p className="import-hint">{t('admin.classColumnsHint')}</p>
      {error && <div className="form-error">{error}</div>}
      {enabled === null ? (
        <LoadingSpinner />
      ) : (
        <label className="label-inline">
          <input type="checkbox" checked={enabled} onChange={handleToggle} disabled={busy} />
          {t('admin.classColumnsToggle')}
        </label>
      )}
    </div>
  );
}
