// Collapsible group of item-detail inputs, shared by ItemFormPage. Name and
// category are hidden while a barcode search has already found the product
// (see the search-product-card rendered above this), since they'd just
// duplicate what's already shown there.
import { useState } from 'react';
import { BRANCHES } from '../appConfig';

export default function ItemDetailsFields({
  t,
  hideNameCategory,
  name,
  onNameChange,
  category,
  onCategoryChange,
  quantity,
  onQuantityChange,
  branch,
  onBranchChange,
  expiryDate,
  onExpiryDateChange,
  note,
  onNoteChange,
  previewUrl,
  onPhotoChange,
  photoCandidates,
  onPickCandidate,
  saving,
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="item-details-fields">
      <button
        type="button"
        className="item-details-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {t('itemForm.detailsToggle')}
        <span className={`item-details-chevron${expanded ? ' open' : ''}`} aria-hidden="true">
          ›
        </span>
      </button>
      {expanded && (
        <div className="item-details-body">
          {!hideNameCategory && (
            <label className="label-inline">
              {t('itemForm.name')}
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={t('itemForm.namePlaceholder')}
              />
            </label>
          )}
          {!hideNameCategory && (
            <label className="label-inline">
              {t('itemForm.category')}
              <input
                type="text"
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                placeholder={t('itemForm.categoryPlaceholder')}
              />
            </label>
          )}
          <label className="label-inline">
            {t('itemForm.expiryDate')}
            <input type="date" value={expiryDate} onChange={(e) => onExpiryDateChange(e.target.value)} />
          </label>
          <label className="label-inline">
            {t('itemForm.quantity')}
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              placeholder={t('itemForm.quantityPlaceholder')}
            />
          </label>
          {BRANCHES.length > 0 && (
            <label className="label-inline">
              {t('itemForm.branch')}
              <select value={branch} onChange={(e) => onBranchChange(e.target.value)}>
                <option value="">{t('itemForm.noBranchOption')}</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t('itemForm.note')}
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t('itemForm.notePlaceholder')}
              rows={3}
            />
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
              <input type="file" accept="image/*" onChange={onPhotoChange} hidden />
            </label>
          </div>
          {photoCandidates.length > 0 && (
            <div className="photo-candidates-wrap">
              <p className="search-status">{t('itemForm.photoCandidatesHint')}</p>
              <div className="photo-candidates">
                {photoCandidates.map((candidate, i) => (
                  <button
                    type="button"
                    key={i}
                    className="photo-candidate"
                    onClick={() => onPickCandidate(candidate.base64)}
                  >
                    <img src={candidate.base64} alt={t('itemForm.previewAlt')} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? t('itemForm.saving') : t('itemForm.save')}
          </button>
        </div>
      )}
    </div>
  );
}
