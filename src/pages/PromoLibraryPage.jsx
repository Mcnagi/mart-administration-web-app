import { useEffect, useState } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos } from '../services/promoService';
import LoadingSpinner from '../components/LoadingSpinner';
import PromoLibraryBrowser from '../components/promoLibrary/PromoLibraryBrowser';

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

  if (error) return <div className="page page-error">{error}</div>;
  if (promos === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <PromoLibraryBrowser promos={promos} onPromosChanged={loadPromos} />
    </div>
  );
}
