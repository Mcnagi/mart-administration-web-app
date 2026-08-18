import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SelectionProvider } from './context/SelectionContext';
import { ItemsProvider } from './context/ItemsContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import LoadingSpinner from './components/LoadingSpinner';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ItemsPage = lazy(() => import('./pages/ItemsPage'));
const ItemFormPage = lazy(() => import('./pages/ItemFormPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const PromoLibraryPage = lazy(() => import('./pages/PromoLibraryPage'));
const PromoBuilderPage = lazy(() => import('./pages/PromoBuilderPage'));
const PromoPrintPage = lazy(() => import('./pages/PromoPrintPage'));

function AppLayout() {
  const { loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return (
    <div className="app-shell">
      <ItemsProvider>
        <SelectionProvider>
          <NavBar />
          <main className="app-main">
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<ItemsPage />} />
                  <Route path="/add" element={<ItemFormPage />} />
                  <Route path="/edit/:itemId" element={<ItemFormPage />} />
                  <Route path="/promos" element={<PromoLibraryPage />} />
                  <Route path="/promos/new" element={<PromoBuilderPage />} />
                  <Route path="/promos/print" element={<PromoPrintPage />} />
                  <Route path="/promos/:promoId/edit" element={<PromoBuilderPage />} />
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
