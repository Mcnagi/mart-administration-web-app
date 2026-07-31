import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { saveItem, removeItem } from '../services/itemService';
import * as itemsApi from '../api/itemsApi';
import LoadingSpinner from '../components/LoadingSpinner';
import { BRANCHES } from '../appConfig';

export default function ItemFormPage() {
  const { itemId } = useParams();
  const isEditing = !!itemId;
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [branch, setBranch] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [existingPhotoBase64, setExistingPhotoBase64] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
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
          setError('Item not found.');
          return;
        }
        setName(item.name || '');
        setQuantity(item.quantity ?? '');
        setExpiryDate(item.expiryDate || '');
        setBranch(item.branch || '');
        setExistingPhotoBase64(item.photoBase64 || '');
        setPreviewUrl(item.photoBase64 || '');
      })
      .catch((err) => setError(err.message || 'Failed to load item.'))
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
        { id: itemId, name, quantity, expiryDate, branch, photoFile, existingPhotoBase64 },
        user.uid
      );
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this item?')) return;
    setSaving(true);
    try {
      await removeItem(itemId);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to delete item.');
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <h2>{isEditing ? 'Edit item' : 'Add item'}</h2>
      <form className="item-form" onSubmit={handleSubmit}>
        <label>
          Photo
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>
        {previewUrl && (
          <div className="photo-preview">
            <img src={previewUrl} alt="Preview" />
          </div>
        )}
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Milk" />
        </label>
        <label>
          Quantity
          <input
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 2"
          />
        </label>
        <label>
          Expiry date
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </label>
        {BRANCHES.length > 0 && (
          <label>
            Branch
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">No branch</option>
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
            {saving ? 'Saving…' : 'Save'}
          </button>
          {isEditing && (
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
