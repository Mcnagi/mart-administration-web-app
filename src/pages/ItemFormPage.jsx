import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { saveItem, removeItem } from '../services/itemService';
import * as itemsApi from '../api/itemsApi';
import * as usersApi from '../api/usersApi';
import { defaultDisplayNameFromEmail } from '../services/userService';
import LoadingSpinner from '../components/LoadingSpinner';
import { BackIcon } from '../components/icons';
import { BRANCHES } from '../appConfig';

export default function ItemFormPage() {
  const { itemId } = useParams();
  const isEditing = !!itemId;
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t, language } = useTranslation();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [branch, setBranch] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [existingPhotoBase64, setExistingPhotoBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
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
        setExpiryDate(item.expiryDate || '');
        setBranch(item.branch || '');
        setCategory(item.category || '');
        setNote(item.note || '');
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

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveItem(
        { id: itemId, name, quantity, expiryDate, branch, category, note, photoFile, existingPhotoBase64 },
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
      <form className="item-form" onSubmit={handleSubmit}>
        <label>
          {t('itemForm.photo')}
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>
        {previewUrl && (
          <div className="photo-preview">
            <img src={previewUrl} alt={t('itemForm.previewAlt')} />
          </div>
        )}
        <label>
          {t('itemForm.name')}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('itemForm.namePlaceholder')}
          />
        </label>
        <label>
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
        <label>
          {t('itemForm.expiryDate')}
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </label>
        <label>
          {t('itemForm.category')}
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('itemForm.categoryPlaceholder')}
          />
        </label>
        <label>
          {t('itemForm.note')}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('itemForm.notePlaceholder')}
            rows={3}
          />
        </label>
        {BRANCHES.length > 0 && (
          <label>
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
    </div>
  );
}
