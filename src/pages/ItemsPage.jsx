import { useEffect, useState } from 'react';
import { useSelection } from '../context/SelectionContext';
import { useItems } from '../context/ItemsContext';
import { useTranslation } from '../context/LanguageContext';
import LoadingSpinner from '../components/LoadingSpinner';
import SelectionBar from '../components/items/SelectionBar';
import FilterBar from '../components/items/FilterBar';
import ExpirySection from '../components/items/ExpirySection';

export default function ItemsPage() {
  const { selecting: selectMode, setSelecting: setSelectMode } = useSelection();
  const { items, error } = useItems();
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterResult, setFilterResult] = useState({ sections: [], filteredCount: 0, showHeadings: true });

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
          <FilterBar items={items} onFilterChange={setFilterResult} />

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
    </div>
  );
}
