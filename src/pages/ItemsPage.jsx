import { useEffect, useMemo, useState } from 'react';
import { useSelection } from '../context/SelectionContext';
import {
  fetchSortedItems,
  applyDiscount,
  removeItems,
  expiryBucket,
  EXPIRY_GROUPS,
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
  const { selecting: selectMode, setSelecting: setSelectMode } = useSelection();
  const [items, setItems] = useState(itemsCache);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [customPercent, setCustomPercent] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [selectedBranches, setSelectedBranches] = useState(new Set());
  const [selectedExpiryKeys, setSelectedExpiryKeys] = useState(new Set());

  async function loadItems() {
    const data = await fetchSortedItems();
    itemsCache = data;
    setItems(data);
  }

  useEffect(() => {
    let cancelled = false;
    fetchSortedItems()
      .then((data) => {
        if (!cancelled) {
          itemsCache = data;
          setItems(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load items.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Selection state is shared with NavBar (which owns the Select/Cancel
  // toggle and hides the bottom nav while selecting) via context, which
  // outlives this page — clear it if the page unmounts while still
  // selecting so the nav doesn't stay hidden elsewhere.
  useEffect(() => () => setSelectMode(false), [setSelectMode]);

  // Reset any in-progress selection whenever select mode is toggled, in
  // either direction, since NavBar owns the toggle button itself.
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

  function clearFilters() {
    setSelectedBranches(new Set());
    setSelectedExpiryKeys(new Set());
  }

  // Distinct branches present in the data, plus a "No branch" option when
  // some items have none — independent of the VITE_BRANCHES config so the
  // filter always reflects what's actually on items.
  const branchOptions = useMemo(() => {
    const all = items ?? [];
    const names = [...new Set(all.map((item) => item.branch).filter(Boolean))].sort();
    const options = names.map((name) => ({ value: name, label: name }));
    if (all.some((item) => !item.branch)) {
      options.push({ value: '', label: 'No branch' });
    }
    return options;
  }, [items]);

  const filteredItems = useMemo(() => {
    const all = items ?? [];
    return all.filter((item) => {
      if (selectedBranches.size > 0 && !selectedBranches.has(item.branch || '')) return false;
      if (selectedExpiryKeys.size > 0 && !selectedExpiryKeys.has(expiryBucket(item.expiryDate))) return false;
      return true;
    });
  }, [items, selectedBranches, selectedExpiryKeys]);

  const sections = useMemo(() => groupItemsByExpiry(filteredItems), [filteredItems]);

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
      setBulkError(err.message || 'Bulk action failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  function handleBulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} item(s)? This cannot be undone.`)) return;
    runBulk(() => removeItems(Array.from(selectedIds)));
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (items === null) return <LoadingSpinner />;

  return (
    <div className="page">
      {selectMode && selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selectedIds.size} selected</span>
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
              placeholder="%"
              className="bulk-percent-input"
              value={customPercent}
              onChange={(e) => setCustomPercent(e.target.value)}
              aria-label="Custom discount percentage"
            />
            <button
              className="btn-outline"
              disabled={bulkBusy || customPercent === ''}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), customPercent))}
            >
              Apply
            </button>
            <button
              className="btn-outline"
              disabled={bulkBusy}
              onClick={() => runBulk(() => applyDiscount(Array.from(selectedIds), null))}
            >
              None
            </button>
            <button className="btn-outline btn-outline-danger" disabled={bulkBusy} onClick={handleBulkDelete}>
              Delete
            </button>
          </div>
          {bulkError && <div className="form-error">{bulkError}</div>}
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty-state">No items yet. Add your first one.</p>
      ) : (
        <>
          <FilterBar
            branchOptions={branchOptions}
            selectedBranches={selectedBranches}
            onToggleBranch={toggleBranchFilter}
            expiryGroups={EXPIRY_GROUPS}
            selectedExpiryKeys={selectedExpiryKeys}
            onToggleExpiryKey={toggleExpiryFilter}
            onClear={clearFilters}
          />

          {filteredItems.length === 0 ? (
            <p className="empty-state">No items match the selected filters.</p>
          ) : (
            sections.map((section) => (
              <div className="expiry-section" key={section.key}>
                <h3 className={`expiry-section-heading expiry-heading-${section.key}`}>
                  {section.label} <span className="expiry-section-count">{section.items.length}</span>
                </h3>
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
