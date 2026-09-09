import { useEffect, useState } from 'react';
import { useSelection } from '../context/SelectionContext';
import { useItems } from '../context/ItemsContext';
import { useTranslation } from '../context/LanguageContext';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import SelectionBar from '../components/items/SelectionBar';
import FilterBar from '../components/items/FilterBar';
import ExpirySection from '../components/items/ExpirySection';
import { hasLoadedThisRuntime, markLoadedThisRuntime } from '../utils/itemsFilterCache';
import { StickyBottom } from '../components/StickyBar';
import { ArrowUpIcon } from '../components/icons';
import { useScrolledPast } from '../hooks/useScrolledPast';

export default function ItemsPage() {
  const { selecting: selectMode, setSelecting: setSelectMode } = useSelection();
  const { items, error } = useItems();
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterResult, setFilterResult] = useState({ sections: [], filteredCount: 0, showHeadings: true });

  // Other filters (branch/expiry/sort) are cached across visits within the
  // same tab session (see FilterBar), but the discount filter still resets
  // to "no discount" — with a reminder toast — on a real page load: a hard
  // refresh, or a brand-new tab/session. Navigating back to Items within
  // the already-running app (e.g. from an item's detail) keeps whatever
  // discount filter was last picked instead.
  const [isFreshLoad] = useState(() => !hasLoadedThisRuntime());
  const [showDiscountToast, setShowDiscountToast] = useState(isFreshLoad);
  useEffect(() => markLoadedThisRuntime(), []);

  // "Back to top" floats above the scan FAB once scrolled down more than
  // 10% of a viewport height.
  const showBackToTop = useScrolledPast(0.1);

  // Selection state is shared with NavBar (which hides the bottom nav while
  // selecting) via context, which outlives this page — clear it if the page
  // unmounts while still selecting so the nav doesn't stay hidden elsewhere.
  useEffect(() => () => setSelectMode(false), [setSelectMode]);

  // Reset any in-progress selection whenever select mode is toggled, in
  // either direction.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectMode]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (items === null) return <LoadingSpinner />;

  const { sections, filteredCount, showHeadings } = filterResult;

  return (
    <div className="page">
      {selectMode && selectedIds.size > 0 && (
        <SelectionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {items.length === 0 ? (
        <p className="empty-state">{t('items.emptyNone')}</p>
      ) : (
        <>
          {showDiscountToast && (
            <Toast
              message={t('items.discountFilterHint')}
              onDismiss={() => setShowDiscountToast(false)}
            />
          )}

          <FilterBar
            items={items}
            onFilterChange={setFilterResult}
            initialDiscountFilter={isFreshLoad ? 'none' : undefined}
          />

          {filteredCount === 0 ? (
            <p className="empty-state">{t('items.emptyFiltered')}</p>
          ) : (
            sections.map((section) => (
              <ExpirySection
                key={section.key}
                section={section}
                showHeading={showHeadings}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelected}
              />
            ))
          )}
        </>
      )}

      {showBackToTop && (
        <StickyBottom align="right" className="back-to-top-wrap">
          <button
            type="button"
            className="back-to-top-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label={t('items.backToTop')}
          >
            <ArrowUpIcon />
          </button>
        </StickyBottom>
      )}
    </div>
  );
}
