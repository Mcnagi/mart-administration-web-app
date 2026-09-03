import { useEffect, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { PROMO_LAYOUT_OPTIONS, DEFAULT_PROMO_LAYOUT } from '../../promoLayouts';

export default function PromoLibraryBulkBar({ selectedCount, defaultLayout, busy, error, onPrint, onDelete }) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState(defaultLayout || DEFAULT_PROMO_LAYOUT);

  // defaultLayout is the selected promo's own saved paper size (set in the
  // builder) — reseed the picker to it whenever the selection changes, so
  // switching from one promo to another doesn't leave the previous promo's
  // choice showing. The user can still override it below for one print run.
  useEffect(() => {
    setLayout(defaultLayout || DEFAULT_PROMO_LAYOUT);
  }, [defaultLayout]);

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{t('promos.selectedCount', { count: selectedCount })}</span>
      <div className="bulk-actions">
        {selectedCount === 1 ? (
          <>
            <select
              className="bulk-layout-select"
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              aria-label={t('promos.printLayoutLabel')}
            >
              {PROMO_LAYOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            <button type="button" className="btn-outline" onClick={() => onPrint(layout)}>
              {t('promos.print')}
            </button>
          </>
        ) : (
          <button type="button" className="btn-outline" onClick={() => onPrint('pair')}>
            {t('promos.printPair')}
          </button>
        )}
        <button className="btn-outline btn-outline-danger" disabled={busy} onClick={onDelete}>
          {t('promos.delete')}
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
