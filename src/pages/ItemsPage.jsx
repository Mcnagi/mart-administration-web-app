import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSortedItems } from '../services/itemService';
import ItemCard from '../components/ItemCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ItemsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchSortedItems()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load items.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="page page-error">{error}</div>;
  if (items === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Items</h2>
        <Link to="/add" className="btn-primary btn-small">
          + Add item
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">No items yet. Add your first one.</p>
      ) : (
        <div className="item-grid">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
