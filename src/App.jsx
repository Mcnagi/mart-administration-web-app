import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SelectionProvider } from './context/SelectionContext';
import { ItemsProvider } from './context/ItemsContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import LoadingSpinner from './components/LoadingSpinner';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ItemsPage = lazy(() => import('./pages/ItemsPage'));
const ItemFormPage = lazy(() => import('./pages/ItemFormPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const PromoLibraryPage = lazy(() => import('./pages/PromoLibraryPage'));
const PromoBuilderPage = lazy(() => import('./pages/PromoBuilderPage'));
const PromoPrintPage = lazy(() => import('./pages/PromoPrintPage'));
const ScanListHistoryPage = lazy(() => import('./pages/ScanListHistoryPage'));
const ScanListBuilderPage = lazy(() => import('./pages/ScanListBuilderPage'));

// React Router's client-side navigation never resets window scroll on its
// own — without this, a route entered while scrolled down (e.g. clicking
// Print after scrolling through the promo library) keeps that leftover
// scrollY, which spuriously trips NavBar's useScrolledPast(0.05) and floats
// its detached menu button over the new page's top content.
//
// /items is exempt: it restores its own remembered scroll position (see
// itemsScrollCache.js) instead of always landing at the top.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/items') return;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppLayout() {
  const { loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return (
    <div className="app-shell">
      <ItemsProvider>
        <SelectionProvider>
          <ScrollToTop />
          <NavBar />
          <main className="app-main">
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/items" element={<ItemsPage />} />
                  <Route path="/add" element={<ItemFormPage />} />
                  <Route path="/edit/:itemId" element={<ItemFormPage />} />
                  <Route path="/promos" element={<PromoLibraryPage />} />
                  <Route path="/promos/new" element={<PromoBuilderPage />} />
                  <Route path="/promos/print" element={<PromoPrintPage />} />
                  <Route path="/promos/:promoId/edit" element={<PromoBuilderPage />} />
                  <Route path="/scan-lists" element={<ScanListHistoryPage />} />
                  <Route path="/scan-lists/new" element={<ScanListBuilderPage />} />
                  <Route path="/scan-lists/:scanListId/edit" element={<ScanListBuilderPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminUsersPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </SelectionProvider>
      </ItemsProvider>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
