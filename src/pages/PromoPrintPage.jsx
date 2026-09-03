import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos } from '../services/promoService';
import PromoTemplate from '../components/PromoTemplate';
import LoadingSpinner from '../components/LoadingSpinner';

function chunkPairs(arr) {
  const pairs = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push(arr.slice(i, i + 2));
  }
  return pairs;
}

// One entry per selectable print layout (see PromoLibraryBulkBar's layout
// picker). `templateSlot` is the PromoTemplate slot rendered onto the
// sheet — for the two "half" layouts that's the smaller 'pair' slot, left
// occupying only the sheet's top half (the rest stays blank, ready to be
// cut) instead of being paired with a second promo the way `paired: true`
// (the actual "2 per page" layout) fills both halves.
const LAYOUTS = {
  full: { pageSize: 'A4 portrait', sheetClassName: 'promo-print-sheet', templateSlot: 'full' },
  half: { pageSize: 'A4 portrait', sheetClassName: 'promo-print-sheet', templateSlot: 'half' },
  fullLandscape: { pageSize: 'A4 landscape', sheetClassName: 'promo-print-sheet--landscape', templateSlot: 'fullLandscape' },
  halfLandscape: { pageSize: 'A4 landscape', sheetClassName: 'promo-print-sheet--landscape', templateSlot: 'pair' },
  a5Landscape: { pageSize: 'A5 landscape', sheetClassName: 'promo-print-sheet--a5-landscape', templateSlot: 'a5Landscape' },
  pair: { pageSize: 'A4 landscape', sheetClassName: 'promo-print-sheet--landscape', templateSlot: 'pair', paired: true },
};

export default function PromoPrintPage() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const ids = useMemo(() => (searchParams.get('ids') || '').split(',').filter(Boolean), [searchParams]);
  const rawLayout = searchParams.get('layout');
  const layout = LAYOUTS[rawLayout] ? rawLayout : 'full';

  const [promos, setPromos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPromos()
      .then((all) => {
        if (cancelled) return;
        const byId = new Map(all.map((promo) => [promo.id, promo]));
        // Preserve the order the promos were selected in, drop any id that
        // no longer exists (e.g. deleted from another tab).
        setPromos(ids.map((id) => byId.get(id)).filter(Boolean));
      })
      .catch((err) => setError(err.message || t('promos.errorLoad')));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (error) return <div className="page page-error">{error}</div>;
  if (promos === null) return <LoadingSpinner />;

  const { pageSize, sheetClassName, templateSlot, paired } = LAYOUTS[layout];
  const pairs = paired ? chunkPairs(promos) : null;

  return (
    <>
      <style>{`@page { size: ${pageSize}; margin: 0; }`}</style>
      <div className="promo-print-toolbar no-print">
        <Link to="/promos" className="btn-outline">
          {t('promos.backToLibrary')}
        </Link>
        <button type="button" className="btn-primary" onClick={() => window.print()} disabled={promos.length === 0}>
          {t('promos.print')}
        </button>
      </div>

      {promos.length === 0 ? (
        <p className="empty-state no-print">{t('promos.printNoneSelected')}</p>
      ) : (
        <div className="promo-print-page">
          {paired
            ? pairs.map((pair) => (
                <div className={sheetClassName} key={pair.map((promo) => promo.id).join('-')}>
                  {pair.map((promo) => (
                    <PromoTemplate key={promo.id} promo={promo} slot={templateSlot} />
                  ))}
                </div>
              ))
            : promos.map((promo) => (
                <div className={sheetClassName} key={promo.id}>
                  <PromoTemplate promo={promo} slot={templateSlot} />
                </div>
              ))}
        </div>
      )}
    </>
  );
}
