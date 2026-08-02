import { Link } from 'react-router-dom';
import ExpiryBadge from './ExpiryBadge';
import { useTranslation } from '../context/LanguageContext';

export default function ItemCard({ item, selectable = false, selected = false, onToggleSelect }) {
  const { t } = useTranslation();
  const content = (
    <>
      <div className="item-card-photo">
        {item.photoBase64 ? (
          <img src={item.photoBase64} alt={item.name || t('itemCard.photoAlt')} />
        ) : (
          <div className="item-card-photo-placeholder">{t('itemCard.noPhoto')}</div>
        )}
        {item.discountPercent !== null && item.discountPercent !== undefined && (
          <span className="discount-badge">{t('itemCard.discountOff', { percent: item.discountPercent })}</span>
        )}
        {selectable && <span className={`select-check${selected ? ' checked' : ''}`} aria-hidden="true" />}
      </div>
      <div className="item-card-body">
        <div className="item-card-name">{item.name}</div>
        <div className="item-card-bottom">
          {item.quantity !== '' && item.quantity !== undefined && (
            <div className="item-card-qty">{t('itemCard.qty', { qty: item.quantity })}</div>
          )}
          <div className="item-card-badges">
            <ExpiryBadge expiryDate={item.expiryDate} />
            {item.branch && <span className="badge badge-none">{item.branch}</span>}
          </div>
        </div>
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        className={`item-card item-card-selectable${selected ? ' selected' : ''}`}
        onClick={onToggleSelect}
        aria-pressed={selected}
      >
        {content}
      </button>
    );
  }

  return (
    <Link to={`/edit/${item.id}`} className="item-card">
      {content}
    </Link>
  );
}
