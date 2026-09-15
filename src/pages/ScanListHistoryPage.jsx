import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import {
  fetchScanLists,
  removeScanList,
  duplicateScanList,
  mergeScanListItems,
  saveScanListDraft,
  defaultScanListName,
} from '../services/scanListService';
import LoadingSpinner from '../components/LoadingSpinner';
import ScanListRow from '../components/scanLists/ScanListRow';
import { scheduleIdle } from '../utils/idleSchedule';

export default function ScanListHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selecting, setSelecting } = useSelection();
  const [scanLists, setScanLists] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
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

  // Selection state is shared with NavBar (which hides the bottom nav while
  // selecting) via context, which outlives this page — clear it if the page
  // unmounts while still selecting so the nav doesn't stay hidden elsewhere.
  useEffect(() => () => setSelecting(false), [setSelecting]);

  // Reset any in-progress selection whenever select mode is toggled, in
  // either direction.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selecting]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  async function handleDuplicate(scanList) {
    setError('');
    try {
      await duplicateScanList(scanList, user.uid);
      await loadScanLists();
    } catch (err) {
      setError(err.message || t('scanLists.errorDuplicate'));
    }
  }

  // Merging never touches the source lists — it hands off a merged draft to
  // the "new list" builder (via the same localStorage draft it already
  // recovers on mount, see saveScanListDraft/loadScanListDraft) so the user
  // can rename, retag, review quantities, and save it like any other list.
  function handleMerge() {
    const selected = scanLists.filter((scanList) => selectedIds.has(scanList.id));
    const items = mergeScanListItems(selected.map((scanList) => scanList.items || []));
    saveScanListDraft(null, { name: defaultScanListName(), tagId: '', tagLabel: '', items });
    setSelecting(false);
    navigate('/scan-lists/new');
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (scanLists === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <div className="promos-toolbar">
        <h2>{t('scanLists.historyTitle')}</h2>
        <div className="promos-toolbar-actions">
          {selecting && (
            <button
              type="button"
              className="btn-primary btn-small"
              disabled={selectedIds.size < 2}
              onClick={handleMerge}
            >
              {t('scanLists.mergeSelected', { count: selectedIds.size })}
            </button>
          )}
          {scanLists.length > 1 && (
            <button
              type="button"
              className={`select-toggle-btn${selecting ? ' active' : ''}`}
              onClick={() => setSelecting((s) => !s)}
            >
              {selecting ? t('scanLists.cancelSelect') : t('scanLists.selectToMerge')}
            </button>
          )}
          <Link to="/scan-lists/new" className="btn-primary btn-small">
            {t('scanLists.newList')}
          </Link>
        </div>
      </div>

      {scanLists.length === 0 ? (
        <p className="import-hint">{t('scanLists.emptyHistory')}</p>
      ) : (
        <ul className="user-list">
          {scanLists.map((scanList) => (
            <ScanListRow
              key={scanList.id}
              scanList={scanList}
              selecting={selecting}
              selected={selectedIds.has(scanList.id)}
              onToggleSelect={toggleSelected}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
