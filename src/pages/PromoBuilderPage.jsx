import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos, computeFinalPrice } from '../services/promoService';
import * as itemsApi from '../api/itemsApi';
import LoadingSpinner from '../components/LoadingSpinner';
import { BackIcon } from '../components/icons';
import PromoBuilderForm from '../components/promoBuilder/PromoBuilderForm';
import PromoBuilderPreview from '../components/promoBuilder/PromoBuilderPreview';

export default function PromoBuilderPage() {
  const { promoId } = useParams();
  const [searchParams] = useSearchParams();
  const fromItemId = searchParams.get('fromItem');
  const isEditing = !!promoId;
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [nameEn, setNameEn] = useState('');
  const [nameKo, setNameKo] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [sourceItemId, setSourceItemId] = useState(fromItemId || null);
  const [existingPhotoBase64, setExistingPhotoBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(isEditing || !!fromItemId);
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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="page page-error">{error}</div>;

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
        <PromoBuilderForm
          promoId={promoId}
          sourceItemId={sourceItemId}
          existingPhotoBase64={existingPhotoBase64}
          nameEn={nameEn}
          onNameEnChange={setNameEn}
          nameKo={nameKo}
          onNameKoChange={setNameKo}
          originalPrice={originalPrice}
          onOriginalPriceChange={setOriginalPrice}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          finalPrice={finalPrice}
          onFinalPriceChange={setFinalPrice}
          onPreviewUrlChange={setPreviewUrl}
        />

        <PromoBuilderPreview promo={previewPromo} />
      </div>
    </div>
  );
}
