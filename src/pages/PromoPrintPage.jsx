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

export default function PromoPrintPage() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const ids = useMemo(() => (searchParams.get('ids') || '').split(',').filter(Boolean), [searchParams]);
  const rawLayout = searchParams.get('layout');
  const layout = rawLayout === 'pair' || rawLayout === 'half' ? rawLayout : 'full';

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

  const orientation = layout === 'pair' ? 'landscape' : 'portrait';
  const pairs = layout === 'pair' ? chunkPairs(promos) : null;

  return (
    <>
      <style>{`@page { size: A4 ${orientation}; margin: 0; }`}</style>
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
          {layout === 'pair'
            ? pairs.map((pair) => (
                <div className="promo-print-sheet--landscape" key={pair.map((promo) => promo.id).join('-')}>
                  {pair.map((promo) => (
                    <PromoTemplate key={promo.id} promo={promo} slot="pair" />
                  ))}
                </div>
              ))
            : promos.map((promo) => (
                <div className="promo-print-sheet" key={promo.id}>
                  <PromoTemplate promo={promo} slot={layout} />
                </div>
              ))}
        </div>
      )}
    </>
  );
}
