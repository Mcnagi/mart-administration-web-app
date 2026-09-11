import { useEffect, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { fetchScanListTags, createScanListTag, removeScanListTag } from '../../services/scanListService';
import LoadingSpinner from '../LoadingSpinner';

export default function ScanListTagsForm() {
  const { t } = useTranslation();
  const [tags, setTags] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function refresh() {
    return fetchScanListTags()
      .then(setTags)
      .catch((err) => setError(err.message || t('admin.errorLoadTags')));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createScanListTag(newLabel);
      setNewLabel('');
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorCreateTag'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(tag) {
    if (!confirm(t('admin.confirmDeleteTag', { label: tag.label }))) return;
    setError('');
    try {
      await removeScanListTag(tag.id);
      await refresh();
    } catch (err) {
      setError(err.message || t('admin.errorDeleteTag'));
    }
  }

  return (
    <div className="item-form">
      <h3>{t('admin.scanListTagsTitle')}</h3>
      <form className="label-inline" onSubmit={handleAdd}>
        <label className="label-inline">
          {t('admin.newTagLabel')}
          <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} disabled={busy} />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={busy || !newLabel.trim()}>
            {t('admin.addTag')}
          </button>
        </div>
      </form>

      {error && <div className="form-error">{error}</div>}

      {tags === null ? (
        <LoadingSpinner />
      ) : tags.length === 0 ? (
        <p className="import-hint">{t('admin.noTags')}</p>
      ) : (
        <ul className="user-list">
          {tags.map((tag) => (
            <li key={tag.id} className="user-row">
              <div className="user-row-info">
                <span className="user-email">{tag.label}</span>
              </div>
              <div className="user-row-actions">
                <button type="button" className="btn-link btn-link-danger" onClick={() => handleDelete(tag)}>
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
