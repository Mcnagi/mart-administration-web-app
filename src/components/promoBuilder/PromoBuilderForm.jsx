import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../context/LanguageContext';
import { savePromo, removePromo } from '../../services/promoService';

export default function PromoBuilderForm({
  promoId,
  sourceItemId,
  existingPhotoBase64,
  nameEn,
  onNameEnChange,
  nameKo,
  onNameKoChange,
  originalPrice,
  onOriginalPriceChange,
  discountPercent,
  onDiscountPercentChange,
  finalPrice,
  onFinalPriceChange,
  onPreviewUrlChange,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isEditing = !!promoId;

  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    onPreviewUrlChange(URL.createObjectURL(file));
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
          onPreviewUrlChange(URL.createObjectURL(file));
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

  return (
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
          onChange={(e) => onNameEnChange(e.target.value)}
          placeholder={t('promos.nameEnPlaceholder')}
        />
      </label>
      <label>
        {t('promos.nameKo')}
        <input
          type="text"
          value={nameKo}
          onChange={(e) => onNameKoChange(e.target.value)}
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
          onChange={(e) => onOriginalPriceChange(e.target.value)}
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
          onChange={(e) => onDiscountPercentChange(e.target.value)}
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
          onChange={(e) => onFinalPriceChange(e.target.value)}
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
  );
}
