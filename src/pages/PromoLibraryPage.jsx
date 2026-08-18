import { useEffect, useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos } from '../services/promoService';
import LoadingSpinner from '../components/LoadingSpinner';
import PromoLibraryBrowser from '../components/promoLibrary/PromoLibraryBrowser';
import { scheduleIdle } from '../utils/idleSchedule';

export default function PromoLibraryPage() {
  const { t } = useTranslation();
  const [promos, setPromos] = useState(null);
  const [error, setError] = useState('');

  function loadPromos() {
    return fetchPromos()
      .then(setPromos)
      .catch((err) => setError(err.message || t('promos.errorLoad')));
  }

  useEffect(() => {
    // Deferred to idle time so React StrictMode's dev-only double
    // mount/cleanup/mount can cancel the first mount's scheduled fetch
    // before it starts a real read — see utils/idleSchedule.js.
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      fetchPromos()
        .then((data) => {
          if (!cancelled) setPromos(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || t('promos.errorLoad'));
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  if (error) return <div className="page page-error">{error}</div>;
  if (promos === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <PromoLibraryBrowser promos={promos} onPromosChanged={loadPromos} />
    </div>
  );
}
