import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
import { removePromos } from '../../services/promoService';
import PromoLibraryBulkBar from './PromoLibraryBulkBar';
import PromoLibraryGrid from './PromoLibraryGrid';
import { StickyTop } from '../StickyBar';
import { useScrolledPast } from '../../hooks/useScrolledPast';

export default function PromoLibraryBrowser({ promos, onPromosChanged }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Select toggle sits inline next to "New Promo" while at the top of the
  // page, then — past 5% of a viewport height of scroll — detaches into its
  // own fixed StickyTop so it keeps working once the toolbar has scrolled
  // away (same pattern as NavBar's menu button and the Items page).
  const detached = useScrolledPast(0.05);
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

  const selectToggleButton = (
    <button
      type="button"
      className={`select-toggle-btn${selectMode ? ' active' : ''}`}
      onClick={() => setSelectMode((s) => !s)}
    >
      {selectMode ? t('promos.cancel') : t('promos.select')}
    </button>
  );

  return (
    <>
      <div className="promos-toolbar">
        <h2>{t('promos.libraryTitle')}</h2>
        <div className="promos-toolbar-actions">
          <Link to="/promos/new" className="btn-primary btn-small">
            {t('promos.newPromo')}
          </Link>
          {promos.length > 0 && !detached && selectToggleButton}
        </div>
      </div>

      {/* Rendered outside .promos-toolbar once detached, so it stays fixed
          to the viewport rather than scrolling away with the toolbar. */}
      {promos.length > 0 && detached && (
        <StickyTop align="right" className="select-toggle-wrap">
          {selectToggleButton}
        </StickyTop>
      )}

      {selectMode && selectedIds.size > 0 && (
        <PromoLibraryBulkBar
          selectedCount={selectedIds.size}
          defaultLayout={selectedIds.size === 1 ? promos.find((p) => p.id === [...selectedIds][0])?.layout : undefined}
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
