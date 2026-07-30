import { Link } from 'react-router-dom';
import ExpiryBadge from './ExpiryBadge';

export default function ItemCard({ item }) {
  return (
    <Link to={`/edit/${item.id}`} className="item-card">
      <div className="item-card-photo">
        {item.photoBase64 ? (
          <img src={item.photoBase64} alt={item.name || 'Item photo'} />
        ) : (
          <div className="item-card-photo-placeholder">No photo</div>
        )}
      </div>
      <div className="item-card-body">
        <div className="item-card-name">{item.name || 'Untitled item'}</div>
        {item.quantity !== '' && item.quantity !== undefined && (
          <div className="item-card-qty">Qty: {item.quantity}</div>
        )}
        <ExpiryBadge expiryDate={item.expiryDate} />
      </div>
    </Link>
  );
}
