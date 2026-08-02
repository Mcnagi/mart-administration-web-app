import { useState } from 'react';
import { FilterIcon } from './icons';

// Sticky filter toggle + dropdown panel for the items list. Branch and
// expiry-group selections are both multiselect (any match within a group,
// AND across groups) and are owned by the parent so it can also use them to
// filter/section the item list.
export default function FilterBar({
  branchOptions,
  selectedBranches,
  onToggleBranch,
  expiryGroups,
  selectedExpiryKeys,
  onToggleExpiryKey,
  onClear,
}) {
  const [open, setOpen] = useState(false);
  const activeCount = selectedBranches.size + selectedExpiryKeys.size;

  return (
    <div className="filter-bar">
      <button
        type="button"
        className={`filter-toggle-btn${activeCount > 0 ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <FilterIcon />
        Filter
        {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
      </button>

      {open && (
        <div className="filter-panel">
          {branchOptions.length > 0 && (
            <div className="filter-group">
              <div className="filter-group-label">Branch</div>
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
            <div className="filter-group-label">Days to expire</div>
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

          {activeCount > 0 && (
            <button type="button" className="btn-link filter-clear-btn" onClick={onClear}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
