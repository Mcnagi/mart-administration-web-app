import { daysUntilExpiry, expiryBucket } from '../services/itemService';

export default function ExpiryBadge({ expiryDate }) {
  const bucket = expiryBucket(expiryDate);
  const days = daysUntilExpiry(expiryDate);

  if (bucket === 'none') {
    return <span className="badge badge-none">No expiry set</span>;
  }
  if (bucket === 'expired') {
    return <span className="badge badge-expired">Expired {Math.abs(days)}d ago</span>;
  }
  if (days === 0) {
    return <span className="badge badge-week">Expires today</span>;
  }
  if (bucket === 'week') {
    return <span className="badge badge-week">{days}d left</span>;
  }
  if (bucket === 'month') {
    return <span className="badge badge-month">{days}d left</span>;
  }
  return <span className="badge badge-longer">{days}d left</span>;
}
