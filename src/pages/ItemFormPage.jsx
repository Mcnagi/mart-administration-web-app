import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { saveItem, removeItem } from '../services/itemService';
import * as itemsApi from '../api/itemsApi';
import * as usersApi from '../api/usersApi';
import { getDataByBarcode } from '../api/dataApi';
import { getExternalProductInfo, getExternalProductImage } from '../api/barcodeLookupApi';
import { findProductPhotos } from '../services/photoSearchService';
import { defaultDisplayNameFromEmail } from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';
import { BackIcon, BarcodeIcon } from '../components/icons';
import { BRANCHES } from '../appConfig';

// Lazy-loaded: pulls in @zxing/browser, which is sizable and only needed by
// the minority of visits that actually tap "Scan".
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'));

// Hidden while the Google Custom Search API key setup is still being sorted
// out (billing account issue) — flip back on once VITE_GOOGLE_CSE_API_KEY
// is confirmed working. The automatic photo search on barcode lookup stays
// on regardless; it fails silently to an empty result set until then.
const SHOW_SEARCH_PHOTOS_BUTTON = false;

export default function ItemFormPage() {
  const { itemId } = useParams();
  const isEditing = !!itemId;
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t, language } = useTranslation();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [branch, setBranch] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchStatus, setSearchStatus] = useState('');
  const [searchErrorMessage, setSearchErrorMessage] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [existingPhotoBase64, setExistingPhotoBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [photoCandidates, setPhotoCandidates] = useState([]);
  const [loadingPhotoCandidates, setLoadingPhotoCandidates] = useState(false);
  // Combined English + Korean name from the last barcode search, kept
  // around so the manual "Search photos" button can re-run (or force a
  // fresh run past the cache) without redoing the barcode lookup.
  const [photoQuery, setPhotoQuery] = useState('');
  const [uploaderName, setUploaderName] = useState('');
  const [uploadedAt, setUploadedAt] = useState(null);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEditing) {
      // New items default to the current user's own branch, if they have one.
      setBranch(profile?.branch || '');
      return;
    }
    let cancelled = false;
    itemsApi
      .listItems()
      .then((items) => {
        if (cancelled) return;
        const item = items.find((i) => i.id === itemId);
        if (!item) {
          setError(t('itemForm.errorItemNotFound'));
          return;
        }
        setName(item.name || '');
        setQuantity(item.quantity ?? '');
        setSalePrice(item.salePrice ?? '');
        setExpiryDate(item.expiryDate || '');
        setBranch(item.branch || '');
        setCategory(item.category || '');
        setNote(item.note || '');
        setBarcode(item.barcode || '');
        setExistingPhotoBase64(item.photoBase64 || '');
        setPreviewUrl(item.photoBase64 || '');
        setUploadedAt(item.createdAt?.toDate?.() ?? null);
        if (item.ownerId) {
          usersApi
            .getUserProfile(item.ownerId)
            .then((uploaderProfile) => {
              if (cancelled) return;
              // Uploader's profile may have been removed (revokeUser deletes
              // it rather than the underlying Auth account), so fall back
              // silently rather than showing an error for a missing name.
              if (uploaderProfile) {
                setUploaderName(uploaderProfile.displayName || defaultDisplayNameFromEmail(uploaderProfile.email));
              }
            })
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message || t('itemForm.errorLoad')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // profile is only read for its initial value (defaulting a new item's
    // branch) — deliberately excluded so later profile refreshes don't
    // clobber a branch the user has already picked in this form.
  }, [itemId, isEditing]);

  // Arrived here from the bottom bar's scan button (see NavBar), which opens
  // the camera and hands off the detected barcode via navigation state rather
  // than duplicating the lookup logic below. Runs once on mount; only new
  // items can arrive this way.
  useEffect(() => {
    if (isEditing) return;
    const scannedBarcode = location.state?.barcode;
    if (!scannedBarcode) return;
    setBarcode(scannedBarcode);
    handleSearch(scannedBarcode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhotoCandidates([]);
  }

  function handleBarcodeDetected(code) {
    setBarcode(code);
    setScanning(false);
  }

  function handlePickCandidate(base64) {
    setPhotoFile(null);
    setExistingPhotoBase64(base64);
    setPreviewUrl(base64);
    setPhotoCandidates([]);
  }

  // Best-effort search for candidate product photos, run separately from
  // handleSearch's own loading state so it doesn't hold up re-enabling the
  // Search button — see services/photoSearchService.findProductPhotos.
  async function loadPhotoCandidates(barcodeValue, query) {
    setLoadingPhotoCandidates(true);
    try {
      const images = await findProductPhotos(barcodeValue, query);
      setPhotoCandidates(images);
    } catch {
      setPhotoCandidates([]);
    } finally {
      setLoadingPhotoCandidates(false);
    }
  }

  async function handleSearch(codeOverride) {
    // The Search button's onClick passes it directly, so a click event may
    // arrive here too — only a real string override (from the scan handoff
    // above) should take precedence over the barcode field's own state.
    const trimmed = (typeof codeOverride === 'string' && codeOverride ? codeOverride : barcode).trim();
    if (!trimmed) return;
    setSearching(true);
    setSearchResult(null);
    setSearchStatus('');
    setSearchErrorMessage('');
    setPhotoCandidates([]);
    try {
      // A data/{barcode} doc can exist with only a cached `photos` field and
      // no `product` name — e.g. left behind by an earlier Open Food Facts
      // search below (see dataApi.savePhotosForBarcode) — so a real
      // imported-row match requires `product`, not just doc existence.
      const row = await getDataByBarcode(trimmed);
      if (row?.product) {
        setSearchResult(row);
        setCategory([row.class1, row.class2, row.class3].filter(Boolean).join('-'));
        setSearchStatus('found');
        // Any barcode search checks for a photo: reuse the cache if the
        // data doc already has one, otherwise go find candidates using the
        // combined English + Korean name as a single search query.
        const combined = [row.product, row.product2 || row.maker].filter(Boolean).join(' ');
        setPhotoQuery(combined);
        if (row.photos?.length) {
          setPhotoCandidates(row.photos);
        } else {
          loadPhotoCandidates(trimmed, combined);
        }
      } else {
        // Not in our own Firestore data — fall back to an external barcode
        // database. Failures here (the service is down, network error) are
        // treated the same as "not found" rather than surfaced as a search
        // error, since our own lookup already succeeded.
        let info = null;
        try {
          info = await getExternalProductInfo(trimmed);
        } catch {
          info = null;
        }
        if (info) {
          setSearchResult({ product: info.name, quantity: info.quantity, brand: info.brand });
          setCategory(info.category);
          setSearchStatus('foundExternal');
          // Only auto-fill the photo if the user hasn't already picked one —
          // never clobber a manually chosen or existing (edit-mode) photo.
          if (info.imageUrl && !photoFile && !existingPhotoBase64) {
            const imageFile = await getExternalProductImage(info.imageUrl);
            if (imageFile) {
              setPhotoFile(imageFile);
              setPreviewUrl(URL.createObjectURL(imageFile));
            }
          } else if (!info.imageUrl) {
            // Open Food Facts has no photo on file — reuse a cached search
            // (row may be the bare photos-only stub described above), or
            // fall back to a fresh image search using its English name.
            const combined = info.nameEn || info.name;
            setPhotoQuery(combined);
            if (row?.photos?.length) {
              setPhotoCandidates(row.photos);
            } else {
              loadPhotoCandidates(trimmed, combined);
            }
          }
        } else {
          setSearchStatus('notFound');
        }
      }
    } catch (err) {
      setSearchStatus('error');
      setSearchErrorMessage(err.message || '');
    } finally {
      setSearching(false);
    }
  }

  function handleClearSearch() {
    setBarcode('');
    setSearchResult(null);
    setSearchStatus('');
    setSearchErrorMessage('');
    setCategory('');
    setPhotoCandidates([]);
    setLoadingPhotoCandidates(false);
    setPhotoQuery('');
  }

  // Manual re-run of the Google image search, past whatever's cached on the
  // data doc — for when the automatic candidates (or the cache) aren't good
  // enough and the user wants fresh results.
  function handleSearchPhotos() {
    if (!photoQuery || loadingPhotoCandidates) return;
    loadPhotoCandidates(barcode.trim(), photoQuery);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveItem(
        {
          id: itemId,
          name,
          quantity,
          salePrice,
          expiryDate,
          branch,
          category,
          note,
          barcode,
          photoFile,
          existingPhotoBase64,
        },
        user.uid
      );
      navigate('/');
    } catch (err) {
      setError(err.message || t('itemForm.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('itemForm.confirmDelete'))) return;
    setSaving(true);
    try {
      await removeItem(itemId);
      navigate('/');
    } catch (err) {
      setError(err.message || t('itemForm.errorDelete'));
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={() => navigate('/')} aria-label={t('itemForm.back')}>
          <BackIcon />
        </button>
        <h2>{isEditing ? t('itemForm.editTitle') : t('itemForm.addTitle')}</h2>
      </div>
      {isEditing && (uploaderName || uploadedAt) && (
        <div className="item-form-uploader">
          {uploaderName && t('itemForm.uploadedBy', { name: uploaderName })}
          {uploaderName && uploadedAt && ' · '}
          {uploadedAt && t('itemForm.uploadedOn', { date: uploadedAt.toLocaleDateString(language) })}
        </div>
      )}
      {isEditing && (
        <Link to={`/promos/new?fromItem=${itemId}`} className="btn-outline create-promo-link">
          {t('itemForm.createPromo')}
        </Link>
      )}
      <form className="item-form" onSubmit={handleSubmit}>
        <label>
          {t('itemForm.barcode')}
          <div className="barcode-input-row">
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder={t('itemForm.barcodePlaceholder')}
            />
            <button
              type="button"
              className="barcode-scan-inline-btn"
              onClick={() => setScanning(true)}
              aria-label={t('itemForm.scan')}
            >
              <BarcodeIcon />
            </button>
          </div>
          <div className="barcode-actions-row">
            <button
              type="button"
              className="btn-outline barcode-scan-btn"
              onClick={handleSearch}
              disabled={!barcode.trim() || searching}
            >
              {searching ? t('itemForm.searching') : t('itemForm.search')}
            </button>
            <button
              type="button"
              className="btn-outline barcode-scan-btn"
              onClick={handleClearSearch}
              disabled={!barcode && !searchResult && !searchStatus}
            >
              {t('itemForm.clearSearch')}
            </button>
          </div>
        </label>
        {searchStatus && (
          <p className="search-status">
            {searchStatus === 'found' && t('itemForm.searchFound')}
            {searchStatus === 'foundExternal' && t('itemForm.searchFoundExternal')}
            {searchStatus === 'notFound' && t('itemForm.searchNotFound')}
            {searchStatus === 'error' && (searchErrorMessage || t('itemForm.searchError'))}
          </p>
        )}
        {searchResult ? (
          <div className="search-product-card">
            {searchResult.brand && (
              <>
                <span className="search-product-name-label">{t('itemForm.brand')}</span>
                <span className="search-product-line">{searchResult.brand}</span>
              </>
            )}
            <span className="search-product-name-label">{t('itemForm.name')}</span>
            <span className="search-product-line">
              {[searchResult.product, searchResult.quantity || searchResult.product2].filter(Boolean).join(' ')}
            </span>
            {category && (
              <>
                <span className="search-product-name-label">{t('itemForm.category')}</span>
                <span className="search-product-line">{category}</span>
              </>
            )}
          </div>
        ) : (
          <label>
            {t('itemForm.name')}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('itemForm.namePlaceholder')}
            />
          </label>
        )}
        {!searchResult && (
          <label>
            {t('itemForm.category')}
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('itemForm.categoryPlaceholder')}
            />
          </label>
        )}
        <label className="label-inline">
          {t('itemForm.salePrice')}
          <input
            type="number"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder={t('itemForm.salePricePlaceholder')}
          />
        </label>
        <label className="label-inline">
          {t('itemForm.quantity')}
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={t('itemForm.quantityPlaceholder')}
          />
        </label>
        {BRANCHES.length > 0 && (
          <label className="label-inline">
            {t('itemForm.branch')}
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">{t('itemForm.noBranchOption')}</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="form-section-label">{t('itemForm.optionalSectionTitle')}</div>

        <label className="label-inline">
          {t('itemForm.expiryDate')}
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </label>
        <div className="photo-field">
          <span className="photo-field-label">{t('itemForm.photo')}</span>
          {previewUrl && (
            <div className="photo-preview">
              <img src={previewUrl} alt={t('itemForm.previewAlt')} />
            </div>
          )}
          <label className="btn-outline photo-upload-btn">
            {previewUrl ? t('itemForm.changePhoto') : t('itemForm.uploadPhoto')}
            <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
          </label>
        </div>
        {SHOW_SEARCH_PHOTOS_BUTTON && photoQuery && (
          <button
            type="button"
            className="btn-outline"
            onClick={handleSearchPhotos}
            disabled={loadingPhotoCandidates}
          >
            {loadingPhotoCandidates ? t('itemForm.searchingPhotos') : t('itemForm.searchPhotos')}
          </button>
        )}
        {loadingPhotoCandidates && <p className="search-status">{t('itemForm.searchingPhotos')}</p>}
        {photoCandidates.length > 0 && (
          <div className="photo-candidates-wrap">
            <p className="search-status">{t('itemForm.photoCandidatesHint')}</p>
            <div className="photo-candidates">
              {photoCandidates.map((candidate, i) => (
                <button
                  type="button"
                  key={i}
                  className="photo-candidate"
                  onClick={() => handlePickCandidate(candidate.base64)}
                >
                  <img src={candidate.base64} alt={t('itemForm.previewAlt')} />
                </button>
              ))}
            </div>
          </div>
        )}
        <label>
          {t('itemForm.note')}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('itemForm.notePlaceholder')}
            rows={3}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? t('itemForm.saving') : t('itemForm.save')}
          </button>
          {isEditing && (
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
              {t('itemForm.delete')}
            </button>
          )}
        </div>
      </form>
      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  );
}
