import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { subscribeItems } from '../services/itemService';
import { useTranslation } from './LanguageContext';

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

  useEffect(() => {
    if (!user) {
      setItems(null);
      return;
    }

    // Deferred to idle time so the initial full-collection read doesn't
    // compete with the current route's own render/chunk-load for network
    // and main-thread time — the page shell paints first, items arrive
    // shortly after. Falls back to a macrotask on browsers without
    // requestIdleCallback (Safari).
    const schedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
    const cancelSchedule = window.cancelIdleCallback || clearTimeout;

    let unsubscribe = null;
    let cancelled = false;
    const handle = schedule(() => {
      if (cancelled) return;
      unsubscribe = subscribeItems(
        (data) => setItems(data),
        (err) => setError(err.message || t('items.errorLoad'))
      );
    });

    return () => {
      cancelled = true;
      cancelSchedule(handle);
      if (unsubscribe) unsubscribe();
    };
  }, [user, t]);

  return <ItemsContext.Provider value={{ items, error }}>{children}</ItemsContext.Provider>;
}

export function useItems() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItems must be used within ItemsProvider');
  return ctx;
}
