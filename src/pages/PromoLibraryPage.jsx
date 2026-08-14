import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos, removePromos } from '../services/promoService';
import PromoTemplate from '../components/PromoTemplate';
import LoadingSpinner from '../components/LoadingSpinner';

export default function PromoLibraryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [promos, setPromos] = useState(null);
  const [error, setError] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');

  function loadPromos() {
    return fetchPromos()
      .then(setPromos)
      .catch((err) => setError(err.message || t('promos.errorLoad')));
  }

  useEffect(() => {
    let cancelled = false;
    fetchPromos()
      .then((data) => {
        if (!cancelled) setPromos(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('promos.errorLoad'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  function goToPrint(layout) {
    navigate(`/promos/print?ids=${Array.from(selectedIds).join(',')}&layout=${layout}`);
  }

  async function handleBulkDelete() {
    if (!confirm(t('promos.confirmBulkDelete', { count: selectedIds.size }))) return;
    setBulkError('');
    setBulkBusy(true);
    try {
      await removePromos(Array.from(selectedIds));
      await loadPromos();
      setSelectedIds(new Set());
    } catch (err) {
      setBulkError(err.message || t('promos.errorBulk'));
    } finally {
      setBulkBusy(false);
    }
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (promos === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <div className="promos-toolbar">
        <h2>{t('promos.libraryTitle')}</h2>
        <div className="promos-toolbar-actions">
          <Link to="/promos/new" className="btn-primary btn-small">
            {t('promos.newPromo')}
          </Link>
          {promos.length > 0 && (
            <button type="button" className="select-toggle-btn" onClick={() => setSelectMode((s) => !s)}>
              {selectMode ? t('promos.cancel') : t('promos.select')}
            </button>
          )}
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{t('promos.selectedCount', { count: selectedIds.size })}</span>
          <div className="bulk-actions">
            {selectedIds.size === 1 ? (
              <>
                <button type="button" className="btn-outline" onClick={() => goToPrint('full')}>
                  {t('promos.printFull')}
                </button>
                <button type="button" className="btn-outline" onClick={() => goToPrint('half')}>
                  {t('promos.printHalf')}
                </button>
              </>
            ) : (
              <button type="button" className="btn-outline" onClick={() => goToPrint('pair')}>
                {t('promos.printPair')}
              </button>
            )}
            <button className="btn-outline btn-outline-danger" disabled={bulkBusy} onClick={handleBulkDelete}>
              {t('promos.delete')}
            </button>
          </div>
          {bulkError && <div className="form-error">{bulkError}</div>}
        </div>
      )}

      {promos.length === 0 ? (
        <p className="empty-state">{t('promos.emptyNone')}</p>
      ) : (
        <div className="promo-library-grid">
          {promos.map((promo) => {
            const selected = selectedIds.has(promo.id);
            const thumb = (
              <>
                <PromoTemplate promo={promo} slot="full" scale={0.18} />
                <div className="promo-library-card-name">{promo.nameEn}</div>
              </>
            );
            if (selectMode) {
              return (
                <button
                  key={promo.id}
                  type="button"
                  className={`promo-library-card${selected ? ' selected' : ''}`}
                  onClick={() => toggleSelected(promo.id)}
                  aria-pressed={selected}
                >
                  {thumb}
                </button>
              );
            }
            return (
              <Link key={promo.id} to={`/promos/${promo.id}/edit`} className="promo-library-card">
                {thumb}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
