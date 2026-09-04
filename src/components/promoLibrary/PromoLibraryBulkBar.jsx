import { useEffect, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { PROMO_LAYOUT_OPTIONS, PROMO_PAIR_LAYOUT_OPTIONS, DEFAULT_PROMO_LAYOUT } from '../../promoLayouts';

// Print-time-only "2 per sheet" combinations only make sense once 2+ promos
// are selected — a single promo just gets its own single-page layouts (see
// PROMO_LAYOUT_OPTIONS), each of which still prints fine with more than one
// promo selected: PromoPrintPage puts one promo per page in that case.
const MULTI_LAYOUT_OPTIONS = [...PROMO_LAYOUT_OPTIONS, ...PROMO_PAIR_LAYOUT_OPTIONS];

export default function PromoLibraryBulkBar({ selectedCount, defaultLayout, busy, error, onPrint, onDelete }) {
  const { t } = useTranslation();
  const isMulti = selectedCount > 1;
  const [layout, setLayout] = useState(defaultLayout || (isMulti ? 'pair' : DEFAULT_PROMO_LAYOUT));

  // defaultLayout is the selected promo's own saved paper size (set in the
  // builder) — reseed the picker to it whenever the selection (or its size)
  // changes, so switching from one promo to another, or from one to many,
  // doesn't leave a stale choice showing. The user can still override it
  // below for one print run.
  useEffect(() => {
    setLayout(defaultLayout || (isMulti ? 'pair' : DEFAULT_PROMO_LAYOUT));
  }, [defaultLayout, isMulti]);

  const options = isMulti ? MULTI_LAYOUT_OPTIONS : PROMO_LAYOUT_OPTIONS;

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{t('promos.selectedCount', { count: selectedCount })}</span>
      <div className="bulk-actions">
        <select
          className="bulk-layout-select"
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
          aria-label={t('promos.printLayoutLabel')}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        <button type="button" className="btn-outline" onClick={() => onPrint(layout)}>
          {t('promos.print')}
        </button>
        <button className="btn-outline btn-outline-danger" disabled={busy} onClick={onDelete}>
          {t('promos.delete')}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
