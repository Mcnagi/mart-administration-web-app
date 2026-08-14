import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos, savePromo, removePromo, computeFinalPrice } from '../services/promoService';
import * as itemsApi from '../api/itemsApi';
import LoadingSpinner from '../components/LoadingSpinner';
import PromoTemplate from '../components/PromoTemplate';
import { BackIcon } from '../components/icons';

export default function PromoBuilderPage() {
  const { promoId } = useParams();
  const [searchParams] = useSearchParams();
  const fromItemId = searchParams.get('fromItem');
  const isEditing = !!promoId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [nameEn, setNameEn] = useState('');
  const [nameKo, setNameKo] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [sourceItemId, setSourceItemId] = useState(fromItemId || null);
  const [photoFile, setPhotoFile] = useState(null);
  const [existingPhotoBase64, setExistingPhotoBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(isEditing || !!fromItemId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The recalc effect below reacts to originalPrice/discountPercent changes,
  // including the ones caused by loading existing data below — set this
  // just before those loads so the very next recalc run is skipped, instead
  // of clobbering a saved promo's independently-edited finalPrice the
  // moment its edit page opens.
  const skipNextRecalc = useRef(false);

  useEffect(() => {
    if (isEditing) {
      let cancelled = false;
      fetchPromos()
        .then((promos) => {
          if (cancelled) return;
          const promo = promos.find((p) => p.id === promoId);
          if (!promo) {
            setError(t('promos.errorPromoNotFound'));
            return;
          }
          skipNextRecalc.current = true;
          setNameEn(promo.nameEn || '');
          setNameKo(promo.nameKo || '');
          setOriginalPrice(promo.originalPrice ?? '');
          setDiscountPercent(promo.discountPercent ?? '');
          setFinalPrice(promo.finalPrice ?? '');
          setSourceItemId(promo.sourceItemId || null);
          setExistingPhotoBase64(promo.photoBase64 || '');
          setPreviewUrl(promo.photoBase64 || '');
        })
        .catch((err) => setError(err.message || t('promos.errorLoad')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }

    if (fromItemId) {
      let cancelled = false;
      itemsApi
        .listItems()
        .then((items) => {
          if (cancelled) return;
          const item = items.find((i) => i.id === fromItemId);
          if (item) {
            skipNextRecalc.current = true;
            setNameEn(item.name || '');
            setDiscountPercent(item.discountPercent ?? '');
            setExistingPhotoBase64(item.photoBase64 || '');
            setPreviewUrl(item.photoBase64 || '');
          }
        })
        .catch((err) => setError(err.message || t('promos.errorLoad')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }
    // promoId/fromItemId only ever set once for a given mount of this page.
  }, [promoId, isEditing, fromItemId]);

  // Auto-recalculate finalPrice whenever both inputs are present; leave it
  // alone (still freely editable) when either is missing.
  useEffect(() => {
    if (skipNextRecalc.current) {
      skipNextRecalc.current = false;
      return;
    }
    const computed = computeFinalPrice(originalPrice, discountPercent);
    if (computed !== null) setFinalPrice(computed);
  }, [originalPrice, discountPercent]);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handlePhotoPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          setPhotoFile(file);
          setPreviewUrl(URL.createObjectURL(file));
        }
        break;
      }
    }
  }

  function handleGoogleImageSearch() {
    const query = nameEn.trim() || nameKo.trim();
    if (!query) return;
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`, '_blank', 'noopener');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await savePromo(
        {
          id: promoId,
          nameEn,
          nameKo,
          originalPrice,
          discountPercent,
          finalPrice,
          sourceItemId,
          photoFile,
          existingPhotoBase64,
        },
        user.uid
      );
      navigate('/promos');
    } catch (err) {
      setError(err.message || t('promos.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t('promos.confirmDelete'))) return;
    setSaving(true);
    try {
      await removePromo(promoId);
      navigate('/promos');
    } catch (err) {
      setError(err.message || t('promos.errorDelete'));
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  const previewPromo = {
    nameEn: nameEn || t('promos.previewPlaceholderName'),
    nameKo,
    originalPrice: originalPrice === '' ? null : Number(originalPrice),
    discountPercent: discountPercent === '' ? null : Number(discountPercent),
    finalPrice: finalPrice === '' ? null : Number(finalPrice),
    photoBase64: previewUrl,
  };

  return (
    <div className="page">
      <div className="page-header">
        <button type="button" className="icon-btn" onClick={() => navigate('/promos')} aria-label={t('promos.back')}>
          <BackIcon />
        </button>
        <h2>{isEditing ? t('promos.editTitle') : t('promos.addTitle')}</h2>
      </div>

      <div className="promo-builder-layout">
        <form className="item-form promo-builder-form" onSubmit={handleSubmit}>
          <label>
            {t('promos.photo')}
            <div className="promo-photo-input-row">
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
              <button
                type="button"
                className="btn-outline"
                onClick={handleGoogleImageSearch}
                disabled={!nameEn.trim() && !nameKo.trim()}
              >
                {t('promos.searchGoogleImages')}
              </button>
            </div>
          </label>
          <div className="promo-photo-dropzone" tabIndex={0} onPaste={handlePhotoPaste}>
            {t('promos.pasteHint')}
          </div>
          <label>
            {t('promos.nameEn')}
            <input
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder={t('promos.nameEnPlaceholder')}
            />
          </label>
          <label>
            {t('promos.nameKo')}
            <input
              type="text"
              value={nameKo}
              onChange={(e) => setNameKo(e.target.value)}
              placeholder={t('promos.nameKoPlaceholder')}
            />
          </label>
          <label>
            {t('promos.originalPrice')}
            <input
              type="number"
              min="0"
              step="0.01"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder={t('promos.originalPricePlaceholder')}
            />
          </label>
          <label>
            {t('promos.discountPercent')}
            <input
              type="number"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder={t('promos.discountPercentPlaceholder')}
            />
          </label>
          <label>
            {t('promos.finalPrice')}
            <input
              type="number"
              min="0"
              step="0.01"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
              placeholder={t('promos.finalPricePlaceholder')}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('promos.saving') : t('promos.save')}
            </button>
            {isEditing && (
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
                {t('promos.delete')}
              </button>
            )}
          </div>
        </form>

        <div className="promo-builder-preview">
          <div className="promo-builder-preview-frame">
            <PromoTemplate promo={previewPromo} slot="full" scale={0.45} />
          </div>
        </div>
      </div>
    </div>
  );
}
