import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { fetchScanLists, removeScanList } from '../services/scanListService';
import LoadingSpinner from '../components/LoadingSpinner';
import ScanListRow from '../components/scanLists/ScanListRow';
import { scheduleIdle } from '../utils/idleSchedule';

export default function ScanListHistoryPage() {
  const { t } = useTranslation();
  const [scanLists, setScanLists] = useState(null);
  const [error, setError] = useState('');

  function loadScanLists() {
    return fetchScanLists()
      .then(setScanLists)
      .catch((err) => setError(err.message || t('scanLists.errorLoad')));
  }

  useEffect(() => {
    // Deferred to idle time so React StrictMode's dev-only double
    // mount/cleanup/mount can cancel the first mount's scheduled fetch
    // before it starts a real read — see utils/idleSchedule.js.
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      fetchScanLists()
        .then((data) => {
          if (!cancelled) setScanLists(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || t('scanLists.errorLoad'));
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  async function handleDelete(scanList) {
    if (!confirm(t('scanLists.confirmDelete', { name: scanList.name }))) return;
    setError('');
    try {
      await removeScanList(scanList.id);
      await loadScanLists();
    } catch (err) {
      setError(err.message || t('scanLists.errorDelete'));
    }
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (scanLists === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <div className="promos-toolbar">
        <h2>{t('scanLists.historyTitle')}</h2>
        <Link to="/scan-lists/new" className="btn-primary btn-small">
          {t('scanLists.newList')}
        </Link>
      </div>

      {scanLists.length === 0 ? (
        <p className="import-hint">{t('scanLists.emptyHistory')}</p>
      ) : (
        <ul className="user-list">
          {scanLists.map((scanList) => (
            <ScanListRow key={scanList.id} scanList={scanList} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}
