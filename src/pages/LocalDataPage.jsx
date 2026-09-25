import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchRemoteMeta, downloadToLocal, loadLocalData, clearLocalData } from '../services/localDataService';
import { formatBytes } from '../utils/localDataEncoding';
import { scheduleIdle } from '../utils/idleSchedule';
import LocalDataUploadForm from '../components/admin/LocalDataUploadForm';

const MAX_RESULTS = 50;

function formatTimestamp(value) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return date.toLocaleString();
}

export default function LocalDataPage() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  // undefined = still reading IndexedDB, null = nothing downloaded.
  const [local, setLocal] = useState(undefined);
  // undefined = not loaded yet, null = nothing published.
  const [remote, setRemote] = useState(undefined);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  function refreshRemote() {
    return fetchRemoteMeta()
      .then(setRemote)
      .catch((err) => setError(err.message || t('localData.errorLoadMeta')));
  }

  useEffect(() => {
    let cancelled = false;
    loadLocalData().then((data) => {
      if (!cancelled) setLocal(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Deferred to idle time so StrictMode's dev-only double mount can cancel
    // the first mount's read — see utils/idleSchedule.js.
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (!cancelled) refreshRemote();
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  async function handleDownload() {
    setError('');
    setDownloading(true);
    try {
      setLocal(await downloadToLocal());
      await refreshRemote();
    } catch (err) {
      console.error('[local data] download failed', err);
      setError(err.message || t('localData.errorDownload'));
    } finally {
      setDownloading(false);
    }
  }

  async function handleClear() {
    if (!confirm(t('localData.confirmClear'))) return;
    setError('');
    try {
      await clearLocalData();
      setLocal(null);
    } catch (err) {
      console.error('[local data] clear failed', err);
      setError(err.message || t('localData.errorClear'));
    }
  }

  const results = useMemo(() => {
    if (!local) return [];
    const q = query.trim().toLowerCase();
    if (!q) return local.rows.slice(0, MAX_RESULTS);
    const matches = [];
    for (const row of local.rows) {
      if (row.some((value) => String(value).toLowerCase().includes(q))) {
        matches.push(row);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [local, query]);

  const updateAvailable = remote && (!local || remote.version !== local.version);

  return (
    <div className="page local-data-page">
      {isAdmin && (
        <section className="admin-section">
          <LocalDataUploadForm onPublished={refreshRemote} />
        </section>
      )}

      <section className="admin-section">
        <div className="item-form">
          <h3>{t('localData.title')}</h3>
          <p className="import-hint">{t('localData.hint')}</p>

          {remote === undefined ? null : remote ? (
            <p className="import-range-hint">
              {t('localData.remoteStatus', {
                rows: remote.rowCount?.toLocaleString() ?? 0,
                count: remote.stringCount ?? 0,
                docs: remote.docCount ?? 1,
                size: formatBytes(remote.totalBytes ?? 0),
                date: formatTimestamp(remote.updatedAt),
              })}
            </p>
          ) : (
            <p className="import-range-hint">{t('localData.notPublished')}</p>
          )}

          {local !== undefined && (
            <p className="import-range-hint">
              {local
                ? t('localData.localStatus', {
                    rows: local.rows.length.toLocaleString(),
                    size: formatBytes(local.sizeBytes ?? 0),
                    date: formatTimestamp(local.downloadedAt),
                  })
                : t('localData.noLocal')}
            </p>
          )}
          {updateAvailable && local && <div className="callout">{t('localData.updateAvailable')}</div>}

          <div className="form-actions">
            <button type="button" className="btn-primary" onClick={handleDownload} disabled={downloading || !remote}>
              {downloading ? t('localData.downloading') : local ? t('localData.redownloadButton') : t('localData.downloadButton')}
            </button>
            {local && (
              <button type="button" className="btn-outline" onClick={handleClear} disabled={downloading}>
                {t('localData.clearButton')}
              </button>
            )}
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
      </section>

      {local && (
        <section className="admin-section">
          <div className="item-form">
            <h3>{t('localData.browseTitle')}</h3>
            <label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('localData.searchPlaceholder')}
              />
            </label>
            <p className="import-range-hint">{t('localData.showingResults', { count: results.length, max: MAX_RESULTS })}</p>
            <div className="import-preview-table-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    {local.columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i}>
                      {row.map((value, j) => (
                        <td key={j}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
