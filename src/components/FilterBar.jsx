import { useState } from 'react';
import { FilterIcon } from './icons';
import { useTranslation } from '../context/LanguageContext';

// Sticky filter toggle + dropdown panel for the items list. Branch,
// expiry-group, and discount selections are all multiselect (any match
// within a group, AND across groups) and are owned by the parent so it can
// also use them to filter/section the item list.
export default function FilterBar({
  branchOptions,
  selectedBranches,
  onToggleBranch,
  expiryGroups,
  selectedExpiryKeys,
  onToggleExpiryKey,
  discountGroups,
  selectedDiscountKeys,
  onToggleDiscountKey,
  onClear,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const activeCount = selectedBranches.size + selectedExpiryKeys.size + selectedDiscountKeys.size;

  return (
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
                    onClick={() => onToggleBranch(value)}
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
                  onClick={() => onToggleExpiryKey(key)}
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
                  onClick={() => onToggleDiscountKey(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeCount > 0 && (
            <button type="button" className="btn-link filter-clear-btn" onClick={onClear}>
              {t('filterBar.clearFilters')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
