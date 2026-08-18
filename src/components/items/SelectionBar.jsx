import { useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { applyDiscount, removeItems } from '../../services/itemService';

export default function SelectionBar({ selectedIds, onClearSelection }) {
  const { t } = useTranslation();
  const [customPercent, setCustomPercent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function runBulk(action) {
    if (selectedIds.size === 0) return;
    setError('');
    setBusy(true);
    try {
      await action();
      onClearSelection();
      setCustomPercent('');
    } catch (err) {
      setError(err.message || t('items.errorBulk'));
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!confirm(t('items.confirmBulkDelete', { count: selectedIds.size }))) return;
    runBulk(() => removeItems(Array.from(selectedIds)));
  }

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{t('items.selectedCount', { count: selectedIds.size })}</span>
      <div className="bulk-actions">
        <button className="btn-outline" disabled={busy} onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), 50))}>
          50%
        </button>
        <button className="btn-outline" disabled={busy} onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), 30))}>
          30%
        </button>
        <button className="btn-outline" disabled={busy} onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), 0))}>
          0%
        </button>
        <input
          type="number"
          min="0"
          max="100"
          placeholder={t('items.customPercentPlaceholder')}
          className="bulk-percent-input"
          value={customPercent}
          onChange={(e) => setCustomPercent(e.target.value)}
          aria-label={t('items.customPercentAria')}
        />
        <button
          className="btn-outline"
          disabled={busy || customPercent === ''}
          onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), customPercent))}
        >
          {t('items.apply')}
        </button>
        <button className="btn-outline" disabled={busy} onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), null))}>
          {t('items.none')}
        </button>
        <button className="btn-outline btn-outline-danger" disabled={busy} onClick={handleDelete}>
          {t('items.delete')}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
