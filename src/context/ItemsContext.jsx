import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { subscribeItems, resolveProductName } from '../services/itemService';
import { useTranslation } from './LanguageContext';
import { scheduleIdle } from '../utils/idleSchedule';

// Subscribes once per signed-in session, not per page visit, so navigating
// between nav tabs (Items <-> Promos <-> Account) doesn't tear down and
// re-create the Firestore listener each time — that would re-read every
// document in the collection on every tab switch. Living above the router
// means the listener only (re)starts on sign-in/sign-out.
const ItemsContext = createContext(null);

export function ItemsProvider({ children }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  // Barcode items don't store their own name (see saveItem in
  // itemService.js), so it's resolved here for display: once per barcode,
  // cached by barcode so re-renders and repeat snapshots don't re-look it
  // up. `pendingBarcodes` tracks in-flight lookups separately so a barcode
  // with no match (empty string here) isn't retried on every snapshot.
  const [resolvedNames, setResolvedNames] = useState({});
  const pendingBarcodes = useRef(new Set());

  useEffect(() => {
    if (!user) {
      setItems(null);
      setResolvedNames({});
      pendingBarcodes.current.clear();
      return;
    }

    // Deferred to idle time so the initial full-collection read doesn't
    // compete with the current route's own render/chunk-load for network
    // and main-thread time — the page shell paints first, items arrive
    // shortly after. Falls back to a macrotask on browsers without
    // requestIdleCallback (Safari).
    let unsubscribe = null;
    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return;
      unsubscribe = subscribeItems(
        (data) => setItems(data),
        (err) => setError(err.message || t('items.errorLoad'))
      );
    });

    return () => {
      cancelled = true;
      cancelIdle();
      if (unsubscribe) unsubscribe();
    };
  }, [user, t]);

  // Kicks off a name lookup for each barcode item not yet resolved (or in
  // flight) whenever the item list changes — new items, or a resolved name
  // from a previous run landing in `resolvedNames`.
  useEffect(() => {
    if (!items) return;
    const barcodes = [
      ...new Set(
        items
          .filter((item) => !item.name && item.barcode && !(item.barcode in resolvedNames))
          .map((item) => item.barcode)
      ),
    ].filter((barcode) => !pendingBarcodes.current.has(barcode));
    if (barcodes.length === 0) return;

    barcodes.forEach((barcode) => pendingBarcodes.current.add(barcode));
    Promise.all(
      barcodes.map(async (barcode) => [barcode, (await resolveProductName(barcode)) || ''])
    ).then((entries) => {
      setResolvedNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      barcodes.forEach((barcode) => pendingBarcodes.current.delete(barcode));
    });
  }, [items, resolvedNames]);

  const displayItems =
    items &&
    items.map((item) =>
      !item.name && item.barcode && resolvedNames[item.barcode]
        ? { ...item, name: resolvedNames[item.barcode] }
        : item
    );

  return <ItemsContext.Provider value={{ items: displayItems, error }}>{children}</ItemsContext.Provider>;
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used within ItemsProvider');
  return ctx;
}
