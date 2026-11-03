import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import {
  defaultItemListName,
  fetchItemLists,
  fetchItemListTags,
  saveItemList,
  addScannedBarcode,
  removeScannedBarcode,
  resolveScannedBarcode,
  findItemListItem,
  itemListItemName,
  normalizeItemListItems,
  loadItemListLookup,
  resolveItemListItems,
  formatItemListBarcode,
  updateItemQuantity,
  resetItemQuantities,
  uniqueItemListCompanies,
  sortItemListItems,
  exportItemListToExcel,
  loadItemListDraft,
  saveItemListDraft,
  clearItemListDraft,
} from '../services/itemListService';
import LoadingSpinner from '../components/LoadingSpinner';
import Toast from '../components/Toast';
import { BackIcon, ItemListIcon, FilterIcon } from '../components/icons';
import { scheduleIdle } from '../utils/idleSchedule';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { useScanInput } from '../hooks/useScanInput';

// Lazy-loaded for the same reason as NavBar/ItemFormPage's scanner: pulls in
// @zxing/browser, only needed by the minority of visits that tap Scan.
const ItemListScanner = lazy(() => import('../components/ItemListScanner'));

export default function ItemListBuilderPage() {
  const { itemListId } = useParams();
  const isEditing = !!itemListId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  // Recovers an in-progress scan session (name/tag/items) left behind by a
  // misclick to another page before saving — see itemListService's draft
  // helpers. Computed once via the lazy useState form so the localStorage
  // read happens only on mount, not every render; `draft` is only non-null
  // when it matches this exact list (same itemListId, or both "new").
  const [draft] = useState(() => loadItemListDraft(itemListId ?? null));
  const [name, setName] = useState(() => draft?.name ?? (isEditing ? '' : defaultItemListName()));
  const [tagId, setTagId] = useState(() => draft?.tagId ?? '');
  const [tagLabel, setTagLabel] = useState(() => draft?.tagLabel ?? '');
  const [items, setItems] = useState(() => draft?.items ?? []);
  // Latest list for addBarcode's post-await update: a PDA scanner can fire
  // several scans before the first lookup resolves and re-renders, and each
  // must build on the previous one's result rather than a stale closure.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [tags, setTags] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(isEditing);
  // { index, columns } — the local-data copy the items are looked up in,
  // and the admin's display columns (see loadItemListLookup).
  const [lookup, setLookup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const [selectedBarcodes, setSelectedBarcodes] = useState(() => new Set());
  // While on, every scan/manual entry removes that barcode's row instead of
  // adding it (a barcode not on the list is silently ignored).
  const [deleteMode, setDeleteMode] = useState(false);

  // Items only store barcode + quantity; everything else shown comes from
  // the local-data copy, looked up on every change.
  const resolvedItems = useMemo(() => resolveItemListItems(items, lookup?.index ?? null), [items, lookup]);
  const companyOptions = useMemo(() => uniqueItemListCompanies(resolvedItems), [resolvedItems]);

  // Always sorted by name, whether or not a company filter is active, so
  // the table and any export reflect the same order.
  const visibleItems = useMemo(() => {
    const filtered =
      selectedCompanies.size === 0
        ? resolvedItems
        : resolvedItems.filter((item) => selectedCompanies.has(item.row?.companyName || ''));
    return sortItemListItems(filtered);
  }, [resolvedItems, selectedCompanies]);

  function toggleCompanyFilter(company) {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  }

  // Reset any in-progress selection whenever select mode is toggled, in
  // either direction — same convention as ItemsPage/ItemListHistoryPage.
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
    if (!confirm(t('itemLists.confirmBatchRemove', { count: selectedBarcodes.size }))) return;
    setItems((prev) => prev.filter((item) => !selectedBarcodes.has(item.barcode)));
    setSelecting(false);
  }

  useEffect(() => scheduleIdle(() => { import('../components/ItemListScanner'); }), []);

  useEffect(() => {
    let cancelled = false;
    loadItemListLookup()
      .then((data) => !cancelled && setLookup(data))
      .catch(() => !cancelled && setLookup({ index: null, columns: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchItemListTags()
      .then((data) => !cancelled && setTags(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    fetchItemLists()
      .then((lists) => {
        if (cancelled) return;
        const found = lists.find((l) => l.id === itemListId);
        if (!found) {
          setError(t('itemLists.errorNotFound'));
          return;
        }
        // A recovered draft for this same list is more recent unsaved work —
        // keep it instead of overwriting with the last-saved version.
        if (draft) return;
        setName(found.name || '');
        setTagId(found.tagId || '');
        setTagLabel(found.tagLabel || '');
        setItems(normalizeItemListItems(found.items));
      })
      .catch((err) => !cancelled && setError(err.message || t('itemLists.errorLoad')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [itemListId, isEditing, t, draft]);

  // Keeps the recovery draft in sync with every change, so a misclick to
  // another page loses nothing. Skipped while still loading (edit mode
  // fetching the saved list) so that brief window doesn't overwrite a real
  // draft — or the saved list itself — with the still-empty initial state.
  useEffect(() => {
    if (loading) return;
    saveItemListDraft(itemListId ?? null, { name, tagId, tagLabel, items });
  }, [itemListId, name, tagId, tagLabel, items, loading]);

  // Same rule as ItemListScanner.handleDetected: every scan is checked
  // against the local-data copy, and a barcode it doesn't have isn't added.
  // Returns whether the scan was handled (so the manual field can clear).
  async function addBarcode(barcode) {
    setError('');
    const match = await resolveScannedBarcode(barcode).catch(() => ({ status: 'notFound' }));
    const name = match.status === 'found' ? itemListItemName(match.row, barcode) : barcode;
    if (deleteMode) return removeBarcode(barcode, name);
    if (match.status === 'noLocalData') {
      setError(t('itemLists.noLocalData'));
      return false;
    }
    if (match.status !== 'found') {
      setError(t('itemLists.itemNotFound', { barcode }));
      return false;
    }
    const nextItems = addScannedBarcode(itemsRef.current, match.barcode);
    itemsRef.current = nextItems;
    setItems(nextItems);
    const added = nextItems.find((item) => item.barcode === match.barcode);
    setToast(t('itemLists.itemAdded', { name, qty: added.quantity }));
    return true;
  }

  // Delete-mode counterpart of addBarcode. Always reports success so the
  // manual field clears either way — a barcode not on the list is a no-op.
  function removeBarcode(barcode, name) {
    const removed = findItemListItem(itemsRef.current, barcode);
    if (removed) {
      const nextItems = removeScannedBarcode(itemsRef.current, removed.barcode);
      itemsRef.current = nextItems;
      setItems(nextItems);
      setToast(t('itemLists.itemRemoved', { name }));
    }
    return true;
  }

  // Typed-in equivalent of a camera scan (worn/damaged barcodes, or a code
  // the camera just won't focus on) — and the PDA scanner's target when the
  // box has focus, submitting each scan automatically.
  const { inputProps: manualInputProps, submit: submitManual } = useScanInput(async (code) => {
    // Only clear the field once the barcode actually resolves, so a failed
    // lookup leaves the value in place (selected) to correct/retry.
    if (await addBarcode(code)) setManualBarcode('');
  });

  function handleManualAdd(e) {
    e.preventDefault();
    submitManual();
  }

  // PDA's built-in scanner: adds straight to the list, no camera needed.
  useHardwareScanner(addBarcode);

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
      await saveItemList({ id: itemListId, name, tagId, tagLabel, items }, user.uid);
      clearItemListDraft();
      navigate('/item-lists');
    } catch (err) {
      setError(err.message || t('itemLists.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  function handleResetQuantities() {
    if (!confirm(t('itemLists.confirmResetQuantities'))) return;
    setItems(resetItemQuantities(items));
  }

  async function handleExport(exportItems) {
    setError('');
    setExporting(true);
    try {
      await exportItemListToExcel({ name: name.trim() || defaultItemListName(), items: exportItems });
    } catch (err) {
      setError(err.message || t('itemLists.errorExport'));
    } finally {
      setExporting(false);
    }
  }

  if (loading || lookup === null) return <LoadingSpinner />;

  const noItems = items.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={() => navigate('/item-lists')} aria-label={t('itemLists.back')}>
          <BackIcon />
        </button>
        <h2>{isEditing ? t('itemLists.editTitle') : t('itemLists.newList')}</h2>
      </div>

      <div className="item-form">
        <label>
          {t('itemLists.nameLabel')}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('itemLists.tagLabel')}
          <select value={tagId} onChange={handleTagChange}>
            <option value="">{t('itemLists.noTag')}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button type="button" className="btn-outline" onClick={() => setScanning(true)}>
            <ItemListIcon /> {t('itemLists.scanButton')}
          </button>
          <button
            type="button"
            className={`select-toggle-btn delete-mode-toggle${deleteMode ? ' active' : ''}`}
            aria-pressed={deleteMode}
            onClick={() => setDeleteMode((d) => !d)}
          >
            {t('itemLists.deleteMode')}
          </button>
        </div>

        <form className={`item-list-manual-row${deleteMode ? ' delete-mode' : ''}`} onSubmit={handleManualAdd}>
          <input
            {...manualInputProps}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ''))}
            placeholder={deleteMode ? t('itemLists.manualRemovePlaceholder') : t('itemLists.manualBarcodePlaceholder')}
          />
          <button
            type="submit"
            className={`btn-outline${deleteMode ? ' btn-outline-danger' : ''}`}
            disabled={!manualBarcode.trim()}
          >
            {deleteMode ? t('itemLists.manualRemove') : t('itemLists.manualAdd')}
          </button>
        </form>
        {deleteMode && (
          <div className="delete-mode-banner" role="status">
            {t('itemLists.deleteModeHint')}
          </div>
        )}
        {!lookup.index && <div className="form-error">{t('itemLists.noLocalData')}</div>}

        {noItems ? (
          <p className="import-hint">{t('itemLists.emptyBuilder')}</p>
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
                  {t('itemLists.filterByCompany')}
                  {selectedCompanies.size > 0 && <span className="filter-count">{selectedCompanies.size}</span>}
                </button>

                {filterOpen && (
                  <div className="filter-panel">
                    <div className="filter-group">
                      <div className="filter-group-label">{t('itemLists.filterByCompany')}</div>
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
                        {t('itemLists.clearFilters')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="form-actions">
              <button type="button" className="btn-outline" onClick={handleResetQuantities}>
                {t('itemLists.resetQuantities')}
              </button>
              <button
                type="button"
                className={`select-toggle-btn${selecting ? ' active' : ''}`}
                onClick={() => setSelecting((s) => !s)}
              >
                {selecting ? t('itemLists.cancelSelect') : t('itemLists.selectToRemove')}
              </button>
              {selecting && (
                <button
                  type="button"
                  className="btn-outline btn-outline-danger"
                  disabled={selectedBarcodes.size === 0}
                  onClick={handleRemoveSelected}
                >
                  {t('itemLists.removeSelected', { count: selectedBarcodes.size })}
                </button>
              )}
            </div>

            <div className="import-preview-table-wrap item-list-items-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    {selecting && (
                      <th>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          aria-label={t('itemLists.selectAll')}
                        />
                      </th>
                    )}
                    {lookup.columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    <th>{t('itemLists.barcodeCol')}</th>
                    <th>{t('itemLists.quantityCol')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.barcode} className={item.row ? '' : 'item-list-row-missing'}>
                      {selecting && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBarcodes.has(item.barcode)}
                            onChange={() => toggleBarcodeSelected(item.barcode)}
                            aria-label={t('itemLists.selectRow', { name: itemListItemName(item.row, item.barcode) })}
                          />
                        </td>
                      )}
                      {lookup.columns.map((col) => (
                        <td key={col.key}>{item.row?.[col.key] ?? ''}</td>
                      ))}
                      <td title={item.barcode}>{formatItemListBarcode(item.barcode)}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => setItems(updateItemQuantity(items, item.barcode, e.target.value))}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          onClick={() => setItems(removeScannedBarcode(items, item.barcode))}
                        >
                          {t('itemLists.removeRow')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={noItems || saving}>
            {saving ? t('itemLists.saving') : t('itemLists.save')}
          </button>
          <button type="button" className="btn-outline" onClick={() => handleExport(visibleItems)} disabled={noItems || exporting}>
            {exporting ? t('itemLists.exporting') : t('itemLists.export')}
          </button>
          {selectedCompanies.size > 0 && (
            <button
              type="button"
              className="btn-outline"
              onClick={() => handleExport(items)}
              disabled={noItems || exporting}
            >
              {exporting ? t('itemLists.exporting') : t('itemLists.exportAll')}
            </button>
          )}
        </div>
      </div>

      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <ItemListScanner items={items} deleteMode={deleteMode} onItemAdded={setItems} onClose={() => setScanning(false)} />
        </Suspense>
      )}

      {toast && (
        <Toast
          message={toast}
          duration={2000}
          onDismiss={() => setToast('')}
          className={deleteMode ? 'toast-danger' : ''}
        />
      )}
    </div>
  );
}
