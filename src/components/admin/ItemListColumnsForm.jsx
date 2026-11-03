import { useEffect, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import {
  fetchItemListColumnOptions,
  fetchItemListDisplayColumnKeys,
  pickDisplayColumns,
  saveItemListDisplayColumns,
} from '../../services/itemListService';
import LoadingSpinner from '../LoadingSpinner';

// Which local-data columns item lists display (and export). Columns are
// shown and saved in the local data's own column order.
export default function ItemListColumnsForm() {
  const { t } = useTranslation();
  const [options, setOptions] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchItemListColumnOptions(), fetchItemListDisplayColumnKeys()])
      .then(([columns, keys]) => {
        if (cancelled) return;
        setOptions(columns);
        setIsDefault(keys === null);
        setSelected(new Set(pickDisplayColumns(columns, keys).map((c) => c.key)));
      })
      .catch((err) => !cancelled && setError(err.message || t('admin.errorLoadColumns')));
    return () => {
      cancelled = true;
    };
  }, [t]);

  function toggle(key) {
    setMessage('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await saveItemListDisplayColumns(options.filter((c) => selected.has(c.key)).map((c) => c.key));
      setIsDefault(false);
      setMessage(t('admin.columnsSaved'));
    } catch (err) {
      setError(err.message || t('admin.errorSaveColumns'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-form">
      <h3>{t('admin.itemListColumnsTitle')}</h3>
      <p className="import-hint">{t('admin.itemListColumnsHint')}</p>

      {error && <div className="form-error">{error}</div>}

      {options === null ? (
        !error && <LoadingSpinner />
      ) : options.length === 0 ? (
        <p className="import-hint">{t('admin.noColumnOptions')}</p>
      ) : (
        <form className="admin-columns-form" onSubmit={handleSave}>
          {isDefault && <p className="import-hint">{t('admin.itemListColumnsDefault')}</p>}
          <div className="admin-column-options">
            {options.map((column) => (
              <label key={column.key} className="label-inline">
                <input
                  type="checkbox"
                  checked={selected.has(column.key)}
                  onChange={() => toggle(column.key)}
                  disabled={busy}
                />
                {column.label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={busy}>
              {t('admin.saveColumns')}
            </button>
          </div>
          {message && <p className="import-hint">{message}</p>}
        </form>
      )}
    </div>
  );
}
