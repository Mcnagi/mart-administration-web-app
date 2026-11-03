import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import {
  fetchItemLists,
  removeItemList,
  duplicateItemList,
  mergeItemListItems,
  saveItemListDraft,
  defaultItemListName,
  sortItemLists,
} from '../services/itemListService';
import LoadingSpinner from '../components/LoadingSpinner';
import ItemListRow from '../components/itemLists/ItemListRow';
import { scheduleIdle } from '../utils/idleSchedule';

export default function ItemListHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selecting, setSelecting } = useSelection();
  const [itemLists, setItemLists] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [error, setError] = useState('');

  function loadItemLists() {
    return fetchItemLists()
      .then((data) => setItemLists(sortItemLists(data)))
      .catch((err) => setError(err.message || t('itemLists.errorLoad')));
  }

  useEffect(() => {
    // Deferred to idle time so React StrictMode's dev-only double
    // mount/cleanup/mount can cancel the first mount's scheduled fetch
    // before it starts a real read — see utils/idleSchedule.js.
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      fetchItemLists()
        .then((data) => {
          if (!cancelled) setItemLists(sortItemLists(data));
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || t('itemLists.errorLoad'));
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  // Selection state is shared with NavBar (which hides the bottom nav while
  // selecting) via context, which outlives this page — clear it if the page
  // unmounts while still selecting so the nav doesn't stay hidden elsewhere.
  useEffect(() => () => setSelecting(false), [setSelecting]);

  // Reset any in-progress selection whenever select mode is toggled, in
  // either direction.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selecting]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(itemList) {
    if (!confirm(t('itemLists.confirmDelete', { name: itemList.name }))) return;
    setError('');
    try {
      await removeItemList(itemList.id);
      await loadItemLists();
    } catch (err) {
      setError(err.message || t('itemLists.errorDelete'));
    }
  }

  async function handleDuplicate(itemList) {
    setError('');
    try {
      await duplicateItemList(itemList, user.uid);
      await loadItemLists();
    } catch (err) {
      setError(err.message || t('itemLists.errorDuplicate'));
    }
  }

  // Merging never touches the source lists — it hands off a merged draft to
  // the "new list" builder (via the same localStorage draft it already
  // recovers on mount, see saveItemListDraft/loadItemListDraft) so the user
  // can rename, retag, review quantities, and save it like any other list.
  function handleMerge() {
    const selected = itemLists.filter((itemList) => selectedIds.has(itemList.id));
    const items = mergeItemListItems(selected.map((itemList) => itemList.items || []));
    saveItemListDraft(null, { name: defaultItemListName(), tagId: '', tagLabel: '', items });
    setSelecting(false);
    navigate('/item-lists/new');
  }

  if (error) return <div className="page page-error">{error}</div>;
  if (itemLists === null) return <LoadingSpinner />;

  return (
    <div className="page">
      <div className="promos-toolbar">
        <h2>{t('itemLists.historyTitle')}</h2>
        <div className="promos-toolbar-actions">
          {selecting && (
            <button
              type="button"
              className="btn-primary btn-small"
              disabled={selectedIds.size < 2}
              onClick={handleMerge}
            >
              {t('itemLists.mergeSelected', { count: selectedIds.size })}
            </button>
          )}
          {itemLists.length > 1 && (
            <button
              type="button"
              className={`select-toggle-btn${selecting ? ' active' : ''}`}
              onClick={() => setSelecting((s) => !s)}
            >
              {selecting ? t('itemLists.cancelSelect') : t('itemLists.selectToMerge')}
            </button>
          )}
          <Link to="/item-lists/new" className="btn-primary btn-small">
            {t('itemLists.newList')}
          </Link>
        </div>
      </div>

      {itemLists.length === 0 ? (
        <p className="import-hint">{t('itemLists.emptyHistory')}</p>
      ) : (
        <ul className="user-list">
          {itemLists.map((itemList) => (
            <ItemListRow
              key={itemList.id}
              itemList={itemList}
              selecting={selecting}
              selected={selectedIds.has(itemList.id)}
              onToggleSelect={toggleSelected}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
