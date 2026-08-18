import { useEffect, useState } from 'react';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchItems } from '../services/itemService';
import LoadingSpinner from '../components/LoadingSpinner';
import SelectionBar from '../components/items/SelectionBar';
import FilterBar from '../components/items/FilterBar';
import ExpirySection from '../components/items/ExpirySection';

// Kept outside component state so re-mounting the page (e.g. switching tabs
// and coming back) can paint the previous list immediately instead of
// dropping to a loading spinner, which collapses the page and loses scroll
// position.
let itemsCache = null;

export default function ItemsPage() {
  const { selecting: selectMode, setSelecting: setSelectMode } = useSelection();
  const { t } = useTranslation();
  const [items, setItems] = useState(itemsCache);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterResult, setFilterResult] = useState({ sections: [], filteredCount: 0, showHeadings: true });

  async function loadItems() {
    const data = await fetchItems();
    itemsCache = data;
    setItems(data);
  }

  useEffect(() => {
    let cancelled = false;
    fetchItems()
      .then((data) => {
        if (!cancelled) {
          itemsCache = data;
          setItems(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('items.errorLoad'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          onItemsChanged={loadItems}
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
