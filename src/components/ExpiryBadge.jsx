import { daysUntilExpiry, expiryStatus } from '../services/itemService';

export default function ExpiryBadge({ expiryDate }) {
  const status = expiryStatus(expiryDate);
  const days = daysUntilExpiry(expiryDate);

  if (status === 'none') {
    return <span className="badge badge-none">No expiry set</span>;
  }
  if (status === 'expired') {
    return <span className="badge badge-expired">Expired {Math.abs(days)}d ago</span>;
  }
  if (days === 0) {
    return <span className="badge badge-soon">Expires today</span>;
  }
  if (status === 'soon') {
    return <span className="badge badge-soon">{days}d left</span>;
  }
  return <span className="badge badge-ok">{days}d left</span>;
}
