import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import {
  defaultScanListName,
  fetchScanLists,
  fetchScanListTags,
  saveScanList,
  addScannedBarcode,
  resolveScannedItemInfo,
  formatScanListBarcode,
  updateItemQuantity,
  removeItemAt,
  exportScanListToExcel,
  loadScanListDraft,
  saveScanListDraft,
  clearScanListDraft,
} from '../services/scanListService';
import LoadingSpinner from '../components/LoadingSpinner';
import { BackIcon, ScanListIcon } from '../components/icons';
import { scheduleIdle } from '../utils/idleSchedule';

// Lazy-loaded for the same reason as NavBar/ItemFormPage's scanner: pulls in
// @zxing/browser, only needed by the minority of visits that tap Scan.
const ScanListScanner = lazy(() => import('../components/ScanListScanner'));

export default function ScanListBuilderPage() {
  const { scanListId } = useParams();
  const isEditing = !!scanListId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  // Recovers an in-progress scan session (name/tag/items) left behind by a
  // misclick to another page before saving — see scanListService's draft
  // helpers. Computed once via the lazy useState form so the localStorage
  // read happens only on mount, not every render; `draft` is only non-null
  // when it matches this exact list (same scanListId, or both "new").
  const [draft] = useState(() => loadScanListDraft(scanListId ?? null));
  const [name, setName] = useState(() => draft?.name ?? (isEditing ? '' : defaultScanListName()));
  const [tagId, setTagId] = useState(() => draft?.tagId ?? '');
  const [tagLabel, setTagLabel] = useState(() => draft?.tagLabel ?? '');
  const [items, setItems] = useState(() => draft?.items ?? []);
  const [tags, setTags] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => scheduleIdle(() => { import('../components/ScanListScanner'); }), []);

  useEffect(() => {
    let cancelled = false;
    fetchScanListTags()
      .then((data) => !cancelled && setTags(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    fetchScanLists()
      .then((lists) => {
        if (cancelled) return;
        const found = lists.find((l) => l.id === scanListId);
        if (!found) {
          setError(t('scanLists.errorNotFound'));
          return;
        }
        // A recovered draft for this same list is more recent unsaved work —
        // keep it instead of overwriting with the last-saved version.
        if (draft) return;
        setName(found.name || '');
        setTagId(found.tagId || '');
        setTagLabel(found.tagLabel || '');
        setItems(found.items || []);
      })
      .catch((err) => !cancelled && setError(err.message || t('scanLists.errorLoad')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scanListId, isEditing, t, draft]);

  // Keeps the recovery draft in sync with every change, so a misclick to
  // another page loses nothing. Skipped while still loading (edit mode
  // fetching the saved list) so that brief window doesn't overwrite a real
  // draft — or the saved list itself — with the still-empty initial state.
  useEffect(() => {
    if (loading) return;
    saveScanListDraft(scanListId ?? null, { name, tagId, tagLabel, items });
  }, [scanListId, name, tagId, tagLabel, items, loading]);

  // Typed-in equivalent of a camera scan (worn/damaged barcodes, or a code
  // the camera just won't focus on) — same resolve-then-add rule as
  // ScanListScanner.handleDetected: a barcode with no match in the imported
  // data collection isn't added.
  async function handleManualAdd(e) {
    e.preventDefault();
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    setError('');
    setManualBarcode('');
    const info = await resolveScannedItemInfo(trimmed).catch(() => null);
    if (!info?.name) {
      setError(t('scanLists.itemNotFound', { barcode: trimmed }));
      return;
    }
    setItems((prev) => addScannedBarcode(prev, trimmed, info.name, info.nameKo));
  }

  function handleTagChange(e) {
    const id = e.target.value;
    setTagId(id);
    const selected = tags.find((tag) => tag.id === id);
    setTagLabel(selected?.label || '');
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await saveScanList({ id: scanListId, name, tagId, tagLabel, items }, user.uid);
      clearScanListDraft();
      navigate('/scan-lists');
    } catch (err) {
      setError(err.message || t('scanLists.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setError('');
    setExporting(true);
    try {
      await exportScanListToExcel({ name: name.trim() || defaultScanListName(), items });
    } catch (err) {
      setError(err.message || t('scanLists.errorExport'));
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  const noItems = items.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={() => navigate('/scan-lists')} aria-label={t('scanLists.back')}>
          <BackIcon />
        </button>
        <h2>{isEditing ? t('scanLists.editTitle') : t('scanLists.newList')}</h2>
      </div>

      <div className="item-form">
        <label>
          {t('scanLists.nameLabel')}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('scanLists.tagLabel')}
          <select value={tagId} onChange={handleTagChange}>
            <option value="">{t('scanLists.noTag')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button type="button" className="btn-outline" onClick={() => setScanning(true)}>
            <ScanListIcon /> {t('scanLists.scanButton')}
          </button>
        </div>

        <form className="scan-list-manual-row" onSubmit={handleManualAdd}>
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder={t('scanLists.manualBarcodePlaceholder')}
          />
          <button type="submit" className="btn-outline" disabled={!manualBarcode.trim()}>
            {t('scanLists.manualAdd')}
          </button>
        </form>

        {noItems ? (
          <p className="import-hint">{t('scanLists.emptyBuilder')}</p>
        ) : (
          <div className="import-preview-table-wrap scan-list-items-wrap">
            <table className="import-preview-table">
              <thead>
                <tr>
                  <th>{t('scanLists.nameCol')}</th>
                  <th>{t('scanLists.nameKoCol')}</th>
                  <th>{t('scanLists.barcodeCol')}</th>
                  <th>{t('scanLists.quantityCol')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.barcode}>
                    <td>{item.name}</td>
                    <td>{item.nameKo}</td>
                    <td title={item.barcode}>{formatScanListBarcode(item.barcode)}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setItems(updateItemQuantity(items, i, e.target.value))}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-link btn-link-danger" onClick={() => setItems(removeItemAt(items, i))}>
                        {t('scanLists.removeRow')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={noItems || saving}>
            {saving ? t('scanLists.saving') : t('scanLists.save')}
          </button>
          <button type="button" className="btn-outline" onClick={handleExport} disabled={noItems || exporting}>
            {exporting ? t('scanLists.exporting') : t('scanLists.export')}
          </button>
        </div>
      </div>

      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <ScanListScanner items={items} onItemAdded={setItems} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  );
}
