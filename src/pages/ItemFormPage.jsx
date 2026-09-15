import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import {
  saveItem,
  removeItem,
  fetchItemById,
  searchProductByBarcode,
  fetchExternalProductImage,
} from '../services/itemService';
import { resolveUploaderDisplayName } from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';
import ItemDetailsFields from '../components/ItemDetailsFields';
import { BackIcon, BarcodeIcon } from '../components/icons';

// Lazy-loaded: pulls in @zxing/browser, which is sizable and only needed by
// the minority of visits that actually tap "Scan".
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'));

export default function ItemFormPage() {
  const { itemId } = useParams();
  const isEditing = !!itemId;
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t, language } = useTranslation();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
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
  // True when the shown photo is the canonical one already on file in the
  // `data` collection (searchProductByBarcode's canonicalPhoto) — that photo
  // is shared across every item with this barcode, so this form shouldn't
  // offer to replace it.
  const [photoFromDataCollection, setPhotoFromDataCollection] = useState(false);
  // Candidates come only from a legacy cached `photos` field on the data
  // doc (see itemService.searchProductByBarcode) — nothing searches for new
  // ones anymore (the photo-search feature was removed).
  const [photoCandidates, setPhotoCandidates] = useState([]);
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
    fetchItemById(itemId)
      .then((item) => {
        if (cancelled) return;
        if (!item) {
          setError(t('itemForm.errorItemNotFound'));
          return;
        }
        setName(item.name || '');
        setQuantity(item.quantity ?? '');
        setExpiryDate(item.expiryDate || '');
        setBranch(item.branch || '');
        setCategory(item.category || '');
        setNote(item.note || '');
        setBarcode(item.barcode || '');
        setExistingPhotoBase64(item.photoBase64 || '');
        setPreviewUrl(item.photoBase64 || '');
        setUploadedAt(item.createdAt?.toDate?.() ?? null);
        resolveUploaderDisplayName(item.ownerId).then((displayName) => {
          if (!cancelled && displayName) setUploaderName(displayName);
        });
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
    setPhotoFromDataCollection(false);
  }

  function handleBarcodeDetected(code) {
    setBarcode(code);
    setScanning(false);
    handleSearch(code);
  }

  function handlePickCandidate(base64) {
    setPhotoFile(null);
    setExistingPhotoBase64(base64);
    setPreviewUrl(base64);
    setPhotoCandidates([]);
    setPhotoFromDataCollection(false);
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
    // A new search means a (possibly different) product, so whatever photo
    // was showing before — manually picked, from a prior search, or the
    // item's existing saved photo — no longer necessarily belongs to it.
    // Clear it up front rather than only overwriting on a hit, so a barcode
    // with no photo of its own doesn't leave a stale one on screen.
    setPhotoFile(null);
    setExistingPhotoBase64('');
    setPreviewUrl('');
    setPhotoFromDataCollection(false);
    try {
      const result = await searchProductByBarcode(trimmed);
      if (!result) {
        setSearchStatus('notFound');
        return;
      }
      setSearchStatus(result.status);
      if (result.status === 'found') {
        setSearchResult(result.searchResult);
        setCategory(result.category || '');
      }
      if (result.cachedPhotos) {
        setPhotoCandidates(result.cachedPhotos);
      }
      if (result.canonicalPhoto) {
        setExistingPhotoBase64(result.canonicalPhoto);
        setPreviewUrl(result.canonicalPhoto);
        setPhotoFromDataCollection(true);
      } else if (result.externalImageUrl) {
        const imageFile = await fetchExternalProductImage(result.externalImageUrl);
        if (imageFile) {
          setPhotoFile(imageFile);
          setPreviewUrl(URL.createObjectURL(imageFile));
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
    setPhotoFromDataCollection(false);
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
      navigate('/items');
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
      navigate('/items');
    } catch (err) {
      setError(err.message || t('itemForm.errorDelete'));
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  const searchResultRows = searchResult
    ? [
        { label: t('itemForm.brand'), value: searchResult.brand },
        { label: t('itemForm.name'), value: searchResult.product },
        { label: t('itemForm.altName'), value: searchResult.product2 },
        { label: t('itemForm.maker'), value: searchResult.maker },
        { label: t('itemForm.packageSize'), value: searchResult.quantity },
        { label: t('itemForm.category'), value: category },
        {
          label: t('itemForm.salePrice'),
          value: searchResult.salePrice ? `$${Number(searchResult.salePrice).toFixed(2)}` : null,
        },
      ].filter((row) => row.value)
    : [];

  // Shown inside the search-product-card once a search has found something,
  // so the photo sits with the rest of that product's details; otherwise
  // rendered standalone in the same spot, since photo upload doesn't
  // require a search to have run.
  const photoSection = (
    <div className="photo-field">
      <span className="photo-field-label">{t('itemForm.photo')}</span>
      {previewUrl && (
        <div className="photo-preview">
          <img src={previewUrl} alt={t('itemForm.previewAlt')} />
        </div>
      )}
      {photoFromDataCollection ? (
        <p className="search-status">{t('itemForm.photoOnFile')}</p>
      ) : (
        <label className="btn-outline photo-upload-btn">
          {previewUrl ? t('itemForm.changePhoto') : t('itemForm.uploadPhoto')}
          <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
        </label>
      )}
      {!photoFromDataCollection && photoCandidates.length > 0 && (
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
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={() => navigate('/items')} aria-label={t('itemForm.back')}>
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
        <label className="label-inline">
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
        </label>
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
        {searchStatus && (
          <p className="search-status">
            {searchStatus === 'found' && t('itemForm.searchFound')}
            {searchStatus === 'notFound' && t('itemForm.searchNotFound')}
            {searchStatus === 'error' && (searchErrorMessage || t('itemForm.searchError'))}
          </p>
        )}
        {searchResult ? (
          <div className="search-product-card">
            {searchResultRows.map((row) => (
              <Fragment key={row.label}>
                <span className="search-product-name-label">{row.label}</span>
                <span className="search-product-line">{row.value}</span>
              </Fragment>
            ))}
            {photoSection}
          </div>
        ) : (
          photoSection
        )}

        <ItemDetailsFields
          t={t}
          hideNameCategory={!!searchResult}
          name={name}
          onNameChange={setName}
          category={category}
          onCategoryChange={setCategory}
          quantity={quantity}
          onQuantityChange={setQuantity}
          branch={branch}
          onBranchChange={setBranch}
          expiryDate={expiryDate}
          onExpiryDateChange={setExpiryDate}
          note={note}
          onNoteChange={setNote}
          saving={saving}
        />

        {error && <div className="form-error">{error}</div>}
        {isEditing && (
          <div className="form-actions">
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
              {t('itemForm.delete')}
            </button>
          </div>
        )}
      </form>
      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <BarcodeScanner
            onDetected={handleBarcodeDetected}
            onClose={() => setScanning(false)}
            onManualEntry={() => setScanning(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
