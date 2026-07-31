import { useEffect, useState } from 'react';
import { useSelection } from '../context/SelectionContext';
import { fetchSortedItems, applyDiscount, removeItems } from '../services/itemService';
import ItemCard from '../components/ItemCard';
import LoadingSpinner from '../components/LoadingSpinner';

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
        <div className="item-grid">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selectable={selectMode}
              selected={selectedIds.has(item.id)}
              onToggleSelect={() => toggleSelected(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
