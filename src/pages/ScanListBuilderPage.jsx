import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
  resetItemQuantities,
  removeItemAt,
  uniqueScanListCompanies,
  sortScanListItems,
  exportScanListToExcel,
  loadScanListDraft,
  saveScanListDraft,
  clearScanListDraft,
} from '../services/scanListService';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import { BackIcon, ScanListIcon, FilterIcon } from '../components/icons';
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
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [selectedBarcodes, setSelectedBarcodes] = useState(() => new Set());

  const companyOptions = useMemo(() => uniqueScanListCompanies(items), [items]);

  // Always sorted company -> category -> name, whether or not a company
  // filter is active, so the table and any export reflect the same order.
  const visibleItems = useMemo(() => {
    const filtered =
      selectedCompanies.size === 0 ? items : items.filter((item) => selectedCompanies.has(item.companyName || ''));
    return sortScanListItems(filtered);
  }, [items, selectedCompanies]);

  function toggleCompanyFilter(company) {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  }

  // Reset any in-progress selection whenever select mode is toggled, in
  // either direction — same convention as ItemsPage/ScanListHistoryPage.
  useEffect(() => {
    setSelectedBarcodes(new Set());
  }, [selecting]);

  function toggleBarcodeSelected(barcode) {
    setSelectedBarcodes((prev) => {
      const next = new Set(prev);
      if (next.has(barcode)) next.delete(barcode);
      else next.add(barcode);
      return next;
    });
  }

  // "Select all" only ever touches the currently visible (filtered) rows,
  // so it can't silently select items hidden by the company filter.
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedBarcodes.has(item.barcode));

  function toggleSelectAllVisible() {
    setSelectedBarcodes((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleItems.forEach((item) => next.delete(item.barcode));
      else visibleItems.forEach((item) => next.add(item.barcode));
      return next;
    });
  }

  function handleRemoveSelected() {
    if (selectedBarcodes.size === 0) return;
    if (!confirm(t('scanLists.confirmBatchRemove', { count: selectedBarcodes.size }))) return;
    setItems((prev) => prev.filter((item) => !selectedBarcodes.has(item.barcode)));
    setSelecting(false);
  }

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
    const info = await resolveScannedItemInfo(trimmed).catch(() => null);
    if (!info?.name) {
      setError(t('scanLists.itemNotFound', { barcode: trimmed }));
      return;
    }
    // Only clear the field once the barcode actually resolves, so a failed
    // lookup leaves the typed value in place for the user to correct/retry.
    setManualBarcode('');
    const nextItems = addScannedBarcode(items, trimmed, info);
    setItems(nextItems);
    const added = nextItems.find((item) => item.barcode === trimmed);
    setToast(t('scanLists.itemAdded', { name: added.name, qty: added.quantity }));
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

  function handleResetQuantities() {
    if (!confirm(t('scanLists.confirmResetQuantities'))) return;
    setItems(resetItemQuantities(items));
  }

  async function handleExport(exportItems) {
    setError('');
    setExporting(true);
    try {
      await exportScanListToExcel({ name: name.trim() || defaultScanListName(), items: exportItems });
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
            inputMode="numeric"
            pattern="[0-9]*"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ''))}
            placeholder={t('scanLists.manualBarcodePlaceholder')}
          />
          <button type="submit" className="btn-outline" disabled={!manualBarcode.trim()}>
            {t('scanLists.manualAdd')}
          </button>
        </form>

        {noItems ? (
          <p className="import-hint">{t('scanLists.emptyBuilder')}</p>
        ) : (
          <>
            {companyOptions.length > 0 && (
              <div className="filter-bar">
                <button
                  type="button"
                  className={`filter-toggle-btn${selectedCompanies.size > 0 ? ' active' : ''}`}
                  onClick={() => setFilterOpen((o) => !o)}
                  aria-expanded={filterOpen}
                >
                  <FilterIcon />
                  {t('scanLists.filterByCompany')}
                  {selectedCompanies.size > 0 && <span className="filter-count">{selectedCompanies.size}</span>}
                </button>

                {filterOpen && (
                  <div className="filter-panel">
                    <div className="filter-group">
                      <div className="filter-group-label">{t('scanLists.filterByCompany')}</div>
                      <div className="filter-chip-row">
                        {companyOptions.map((company) => (
                          <button
                            key={company}
                            type="button"
                            className={`filter-chip${selectedCompanies.has(company) ? ' selected' : ''}`}
                            aria-pressed={selectedCompanies.has(company)}
                            onClick={() => toggleCompanyFilter(company)}
                          >
                            {company}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedCompanies.size > 0 && (
                      <button
                        type="button"
                        className="btn-link filter-clear-btn"
                        onClick={() => setSelectedCompanies(new Set())}
                      >
                        {t('scanLists.clearFilters')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={handleResetQuantities}>
                {t('scanLists.resetQuantities')}
              </button>
              <button
                type="button"
                className={`select-toggle-btn${selecting ? ' active' : ''}`}
                onClick={() => setSelecting((s) => !s)}
              >
                {selecting ? t('scanLists.cancelSelect') : t('scanLists.selectToRemove')}
              </button>
              {selecting && (
                <button
                  type="button"
                  className="btn-outline btn-outline-danger"
                  disabled={selectedBarcodes.size === 0}
                  onClick={handleRemoveSelected}
                >
                  {t('scanLists.removeSelected', { count: selectedBarcodes.size })}
                </button>
              )}
            </div>

            <div className="import-preview-table-wrap scan-list-items-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    {selecting && (
                      <th>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          aria-label={t('scanLists.selectAll')}
                        />
                      </th>
                    )}
                    <th>{t('scanLists.nameCol')}</th>
                    <th>{t('scanLists.nameKoCol')}</th>
                    <th>{t('scanLists.categoryCol')}</th>
                    <th>{t('scanLists.companyCol')}</th>
                    <th>{t('scanLists.barcodeCol')}</th>
                    <th>{t('scanLists.quantityCol')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const realIndex = items.indexOf(item);
                    return (
                      <tr key={item.barcode}>
                        {selecting && (
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedBarcodes.has(item.barcode)}
                              onChange={() => toggleBarcodeSelected(item.barcode)}
                              aria-label={t('scanLists.selectRow', { name: item.name })}
                            />
                          </td>
                        )}
                        <td>{item.name}</td>
                        <td>{item.nameKo}</td>
                        <td>{item.category}</td>
                        <td>{item.companyName}</td>
                        <td title={item.barcode}>{formatScanListBarcode(item.barcode)}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => setItems(updateItemQuantity(items, realIndex, e.target.value))}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-link btn-link-danger"
                            onClick={() => setItems(removeItemAt(items, realIndex))}
                          >
                            {t('scanLists.removeRow')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={noItems || saving}>
            {saving ? t('scanLists.saving') : t('scanLists.save')}
          </button>
          <button type="button" className="btn-outline" onClick={() => handleExport(visibleItems)} disabled={noItems || exporting}>
            {exporting ? t('scanLists.exporting') : t('scanLists.export')}
          </button>
          {selectedCompanies.size > 0 && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => handleExport(sortScanListItems(items))}
              disabled={noItems || exporting}
            >
              {exporting ? t('scanLists.exporting') : t('scanLists.exportAll')}
            </button>
          )}
        </div>
      </div>

      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <ScanListScanner items={items} onItemAdded={setItems} onClose={() => setScanning(false)} />
        </Suspense>
      )}

      {toast && <Toast message={toast} duration={2000} onDismiss={() => setToast('')} />}
    </div>
  );
}
