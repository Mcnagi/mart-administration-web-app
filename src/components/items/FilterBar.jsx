import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';
import { useTranslation } from '../../context/LanguageContext';
import {
  sortByExpiry,
  sortByCreatedAt,
  expiryBucket,
  discountBucket,
  groupItemsByExpiry,
  EXPIRY_GROUPS,
  DISCOUNT_GROUPS,
} from '../../services/itemService';
import { FilterIcon } from '../icons';

// Sticky filter toggle + dropdown panel, sort control, and select-mode
// toggle for the items list. Owns which branch/expiry/discount chips and
// sort order are active, and reports the filtered+sorted+grouped result up
// so the page can render it — the raw item list is the only thing it needs
// from the parent.
export default function FilterBar({ items, onFilterChange }) {
  const { isAdmin } = useAuth();
  const { selecting, setSelecting } = useSelection();
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState(new Set());
  const [selectedExpiryKeys, setSelectedExpiryKeys] = useState(new Set());
  const [selectedDiscountKeys, setSelectedDiscountKeys] = useState(new Set());
  const [sortBy, setSortBy] = useState('expiry');

  function toggleBranch(branch) {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  }

  function toggleExpiryKey(key) {
    setSelectedExpiryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDiscountKey(key) {
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
  const branchOptions = useMemo(() => {
    const names = [...new Set(items.map((item) => item.branch).filter(Boolean))].sort();
    const hasNoBranch = items.some((item) => !item.branch);
    return [
      ...names.map((name) => ({ value: name, label: name })),
      ...(hasNoBranch ? [{ value: '', label: t('items.noBranch') }] : []),
    ];
  }, [items, t]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedBranches.size > 0 && !selectedBranches.has(item.branch || '')) return false;
      if (selectedExpiryKeys.size > 0 && !selectedExpiryKeys.has(expiryBucket(item.expiryDate))) return false;
      if (selectedDiscountKeys.size > 0 && !selectedDiscountKeys.has(discountBucket(item))) return false;
      return true;
    });
  }, [items, selectedBranches, selectedExpiryKeys, selectedDiscountKeys]);

  // Sorting by expiry keeps the expiry-bucket sections; sorting by upload
  // date is a flat, most-recent-first list instead, since "uploaded" has no
  // natural bucketing of its own.
  const sections = useMemo(() => {
    const sorted = sortBy === 'uploaded' ? sortByCreatedAt(filteredItems) : sortByExpiry(filteredItems);
    return sortBy === 'uploaded' ? [{ key: 'all', items: sorted }] : groupItemsByExpiry(sorted);
  }, [filteredItems, sortBy]);

  useEffect(() => {
    onFilterChange({ sections, filteredCount: filteredItems.length, showHeadings: sortBy !== 'uploaded' });
  }, [sections, filteredItems.length, sortBy, onFilterChange]);

  const activeCount = selectedBranches.size + selectedExpiryKeys.size + selectedDiscountKeys.size;
  const expiryGroups = EXPIRY_GROUPS.map((g) => ({ ...g, label: t(`expiryGroups.${g.key}`) }));
  const discountGroups = DISCOUNT_GROUPS.map((g) => ({ ...g, label: t(`discountGroups.${g.key}`) }));

  return (
    <div className="items-toolbar">
      <div className="items-toolbar-left">
        <div className="filter-bar">
          <button
            type="button"
            className={`filter-toggle-btn${activeCount > 0 ? ' active' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <FilterIcon />
            {t('filterBar.filter')}
            {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
          </button>

          {open && (
            <div className="filter-panel">
              {branchOptions.length > 0 && (
                <div className="filter-group">
                  <div className="filter-group-label">{t('filterBar.branch')}</div>
                  <div className="filter-chip-row">
                    {branchOptions.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className={`filter-chip${selectedBranches.has(value) ? ' selected' : ''}`}
                        aria-pressed={selectedBranches.has(value)}
                        onClick={() => toggleBranch(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="filter-group">
                <div className="filter-group-label">{t('filterBar.daysToExpire')}</div>
                <div className="filter-chip-row">
                  {expiryGroups.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`filter-chip${selectedExpiryKeys.has(key) ? ' selected' : ''}`}
                      aria-pressed={selectedExpiryKeys.has(key)}
                      onClick={() => toggleExpiryKey(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <div className="filter-group-label">{t('filterBar.discount')}</div>
                <div className="filter-chip-row">
                  {discountGroups.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`filter-chip${selectedDiscountKeys.has(key) ? ' selected' : ''}`}
                      aria-pressed={selectedDiscountKeys.has(key)}
                      onClick={() => toggleDiscountKey(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {activeCount > 0 && (
                <button type="button" className="btn-link filter-clear-btn" onClick={clearFilters}>
                  {t('filterBar.clearFilters')}
                </button>
              )}
            </div>
          )}
        </div>

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
          className={`select-toggle-btn${selecting ? ' active' : ''}`}
          onClick={() => setSelecting((s) => !s)}
        >
          {selecting ? t('items.cancel') : t('items.select')}
        </button>
      )}
    </div>
  );
}
