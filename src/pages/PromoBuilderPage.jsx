import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../context/LanguageContext';
import { fetchPromos, computeFinalPrice } from '../services/promoService';
import { fetchItemById, fetchDataRowForBarcode } from '../services/itemService';
import LoadingSpinner from '../components/LoadingSpinner';
import { BackIcon } from '../components/icons';
import PromoBuilderForm from '../components/promoBuilder/PromoBuilderForm';
import PromoBuilderPreview from '../components/promoBuilder/PromoBuilderPreview';
import { DEFAULT_PROMO_LAYOUT } from '../promoLayouts';

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
  const [layout, setLayout] = useState(DEFAULT_PROMO_LAYOUT);
  const [textOffsetX, setTextOffsetX] = useState(0);
  const [textOffsetY, setTextOffsetY] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  const [nameNoWrap, setNameNoWrap] = useState(false);
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
          setLayout(promo.layout || DEFAULT_PROMO_LAYOUT);
          setTextOffsetX(promo.textOffsetX || 0);
          setTextOffsetY(promo.textOffsetY || 0);
          setFontScale(promo.fontScale || 1);
          setNameNoWrap(promo.nameNoWrap || false);
        })
        .catch((err) => setError(err.message || t('promos.errorLoad')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }

    if (fromItemId) {
      let cancelled = false;
      fetchItemById(fromItemId)
        .then(async (item) => {
          if (cancelled || !item) return;
          // The item itself only carries a single name and no sale price —
          // both names and the sale price live on the imported `data`
          // collection row for its barcode, so pull that in too. The item's
          // own photo (if any) still wins over the data row's, since it may
          // have been picked/replaced specifically for this item.
          const dataRow = await fetchDataRowForBarcode(item.barcode);
          if (cancelled) return;
          // Unlike the isEditing branch above, there's no independently-set
          // finalPrice to protect here — this is a brand new promo, so let
          // the recalc effect below compute it fresh from the prefilled
          // originalPrice/discountPercent.
          setNameEn(dataRow?.product || item.name || '');
          setNameKo(dataRow?.product2 || '');
          setOriginalPrice(dataRow?.salePrice ?? '');
          setDiscountPercent(item.discountPercent ?? '');
          const photo = item.photoBase64 || dataRow?.photo || '';
          setExistingPhotoBase64(photo);
          setPreviewUrl(photo);
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
    layout,
    textOffsetX,
    textOffsetY,
    fontScale,
    nameNoWrap,
  };

  function handleResetTextPosition() {
    setTextOffsetX(0);
    setTextOffsetY(0);
  }

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
          layout={layout}
          onLayoutChange={setLayout}
          textOffsetX={textOffsetX}
          textOffsetY={textOffsetY}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
          nameNoWrap={nameNoWrap}
          onNameNoWrapChange={setNameNoWrap}
        />

        <PromoBuilderPreview
          promo={previewPromo}
          onTextOffsetChange={(x, y) => {
            setTextOffsetX(x);
            setTextOffsetY(y);
          }}
          onResetPosition={handleResetTextPosition}
        />
      </div>
    </div>
  );
}
