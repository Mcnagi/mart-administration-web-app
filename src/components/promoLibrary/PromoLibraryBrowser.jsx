import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
import { removePromos } from '../../services/promoService';
import PromoLibraryBulkBar from './PromoLibraryBulkBar';
import PromoLibraryGrid from './PromoLibraryGrid';

export default function PromoLibraryBrowser({ promos, onPromosChanged }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkError('');
  }, [selectMode]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToPrint(layout) {
    navigate(`/promos/print?ids=${Array.from(selectedIds).join(',')}&layout=${layout}`);
  }

  async function handleBulkDelete() {
    if (!confirm(t('promos.confirmBulkDelete', { count: selectedIds.size }))) return;
    setBulkError('');
    setBulkBusy(true);
    try {
      await removePromos(Array.from(selectedIds));
      await onPromosChanged();
      setSelectedIds(new Set());
    } catch (err) {
      setBulkError(err.message || t('promos.errorBulk'));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <div className="promos-toolbar">
        <h2>{t('promos.libraryTitle')}</h2>
        <div className="promos-toolbar-actions">
          <Link to="/promos/new" className="btn-primary btn-small">
            {t('promos.newPromo')}
          </Link>
          {promos.length > 0 && (
            <button type="button" className="select-toggle-btn" onClick={() => setSelectMode((s) => !s)}>
              {selectMode ? t('promos.cancel') : t('promos.select')}
            </button>
          )}
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <PromoLibraryBulkBar
          selectedCount={selectedIds.size}
          busy={bulkBusy}
          error={bulkError}
          onPrint={goToPrint}
          onDelete={handleBulkDelete}
        />
      )}

      {promos.length === 0 ? (
        <p className="empty-state">{t('promos.emptyNone')}</p>
      ) : (
        <PromoLibraryGrid
          promos={promos}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelected}
        />
      )}
    </>
  );
}
