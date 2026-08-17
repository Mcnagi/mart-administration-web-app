import { useTranslation } from '../../context/LanguageContext';

export default function PromoLibraryBulkBar({ selectedCount, busy, error, onPrint, onDelete }) {
  const { t } = useTranslation();

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{t('promos.selectedCount', { count: selectedCount })}</span>
      <div className="bulk-actions">
        {selectedCount === 1 ? (
          <>
            <button type="button" className="btn-outline" onClick={() => onPrint('full')}>
              {t('promos.printFull')}
            </button>
            <button type="button" className="btn-outline" onClick={() => onPrint('half')}>
              {t('promos.printHalf')}
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
