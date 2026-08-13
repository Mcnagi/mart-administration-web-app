import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import {
  fetchItems,
  sortByExpiry,
  sortByCreatedAt,
  applyDiscount,
  removeItems,
  expiryBucket,
  discountBucket,
  EXPIRY_GROUPS,
  DISCOUNT_GROUPS,
  groupItemsByExpiry,
} from '../services/itemService';
import ItemCard from '../components/ItemCard';
import LoadingSpinner from '../components/LoadingSpinner';
import FilterBar from '../components/FilterBar';

// Kept outside component state so re-mounting the page (e.g. switching tabs
// and coming back) can paint the previous list immediately instead of
// dropping to a loading spinner, which collapses the page and loses scroll
// position.
let itemsCache = null;

export default function ItemsPage() {
  const { isAdmin } = useAuth();
  const { selecting: selectMode, setSelecting: setSelectMode } = useSelection();
  const { t } = useTranslation();
  const [items, setItems] = useState(itemsCache);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [customPercent, setCustomPercent] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [selectedBranches, setSelectedBranches] = useState(new Set());
  const [selectedExpiryKeys, setSelectedExpiryKeys] = useState(new Set());
  const [selectedDiscountKeys, setSelectedDiscountKeys] = useState(new Set());
  const [sortBy, setSortBy] = useState('expiry');

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

  function toggleBranchFilter(branch) {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  }

  function toggleExpiryFilter(key) {
    setSelectedExpiryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDiscountFilter(key) {
    setSelectedDiscountKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setSelectedBranches(new Set());
    setSelectedExpiryKeys(new Set());
    setSelectedDiscountKeys(new Set());
  }

  // Distinct branches present in the data, plus a "No branch" option when
  // some items have none — independent of the VITE_BRANCHES config so the
  // filter always reflects what's actually on items.
  const branchNames = useMemo(() => {
    const all = items ?? [];
    return {
      names: [...new Set(all.map((item) => item.branch).filter(Boolean))].sort(),
      hasNoBranch: all.some((item) => !item.branch),
    };
  }, [items]);

  const branchOptions = [
    ...branchNames.names.map((name) => ({ value: name, label: name })),
    ...(branchNames.hasNoBranch ? [{ value: '', label: t('items.noBranch') }] : []),
  ];

  const filteredItems = useMemo(() => {
    const all = items ?? [];
    return all.filter((item) => {
      if (selectedBranches.size > 0 && !selectedBranches.has(item.branch || '')) return false;
      if (selectedExpiryKeys.size > 0 && !selectedExpiryKeys.has(expiryBucket(item.expiryDate))) return false;
      if (selectedDiscountKeys.size > 0 && !selectedDiscountKeys.has(discountBucket(item))) return false;
      return true;
    });
  }, [items, selectedBranches, selectedExpiryKeys, selectedDiscountKeys]);

  // Sorting by expiry keeps the expiry-bucket sections; sorting by upload
  // date is a flat, most-recent-first list instead, since "uploaded" has no
  // natural bucketing of its own.
  const sortedItems = useMemo(
    () => (sortBy === 'uploaded' ? sortByCreatedAt(filteredItems) : sortByExpiry(filteredItems)),
    [filteredItems, sortBy]
  );

  const sections = useMemo(
    () => (sortBy === 'uploaded' ? [{ key: 'all', items: sortedItems }] : groupItemsByExpiry(sortedItems)),
    [sortedItems, sortBy]
  );

  async function runBulk(action) {
    if (selectedIds.size === 0) return;
    setBulkError('');
    setBulkBusy(true);
    try {
      await action();
      await loadItems();
      setSelectedIds(new Set());
      setCustomPercent('');
    } catch (err) {
      setBulkError(err.message || t('items.errorBulk'));
    } finally {
      setBulkBusy(false);
    }
  }

  function handleBulkDelete() {
    if (!confirm(t('items.confirmBulkDelete', { count: selectedIds.size }))) return;
    runBulk(() => removeItems(Array.from(selectedIds)));
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (items === null) return <LoadingSpinner />;

  return (
    <div className="page">
      {selectMode && selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{t('items.selectedCount', { count: selectedIds.size })}</span>
          <div className="bulk-actions">
            <button
              className="btn-outline"
              disabled={bulkBusy}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), 50))}
            >
              50%
            </button>
            <button
              className="btn-outline"
              disabled={bulkBusy}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), 30))}
            >
              30%
            </button>
            <button
              className="btn-outline"
              disabled={bulkBusy}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), 0))}
            >
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
              disabled={bulkBusy || customPercent === ''}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), customPercent))}
            >
              {t('items.apply')}
            </button>
            <button
              className="btn-outline"
              disabled={bulkBusy}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), null))}
            >
              {t('items.none')}
            </button>
            <button className="btn-outline btn-outline-danger" disabled={bulkBusy} onClick={handleBulkDelete}>
              {t('items.delete')}
            </button>
          </div>
          {bulkError && <div className="form-error">{bulkError}</div>}
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-state">{t('items.emptyNone')}</p>
      ) : (
        <>
          <div className="items-toolbar">
            <div className="items-toolbar-left">
              <FilterBar
                branchOptions={branchOptions}
                selectedBranches={selectedBranches}
                onToggleBranch={toggleBranchFilter}
                expiryGroups={EXPIRY_GROUPS.map((g) => ({ ...g, label: t(`expiryGroups.${g.key}`) }))}
                selectedExpiryKeys={selectedExpiryKeys}
                onToggleExpiryKey={toggleExpiryFilter}
                discountGroups={DISCOUNT_GROUPS.map((g) => ({ ...g, label: t(`discountGroups.${g.key}`) }))}
                selectedDiscountKeys={selectedDiscountKeys}
                onToggleDiscountKey={toggleDiscountFilter}
                onClear={clearFilters}
              />
              <label className="sort-select-label">
                <span className="sort-select-label-text">{t('sortBar.label')}</span>
                <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="expiry">{t('sortBar.expiry')}</option>
                  <option value="uploaded">{t('sortBar.uploaded')}</option>
                </select>
              </label>
            </div>
            {isAdmin && (
              <button
                type="button"
                className={`select-toggle-btn${selectMode ? ' active' : ''}`}
                onClick={() => setSelectMode((s) => !s)}
              >
                {selectMode ? t('items.cancel') : t('items.select')}
              </button>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <p className="empty-state">{t('items.emptyFiltered')}</p>
          ) : (
            sections.map((section) => (
              <div className="expiry-section" key={section.key}>
                {sortBy !== 'uploaded' && (
                  <h3 className={`expiry-section-heading expiry-heading-${section.key}`}>
                    {t(`expiryGroups.${section.key}`)}{' '}
                    <span className="expiry-section-count">{section.items.length}</span>
                  </h3>
                )}
                <div className="item-grid">
                  {section.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      selectable={selectMode}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelected(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
