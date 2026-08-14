import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SelectionProvider } from './context/SelectionContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import NavBar from './components/NavBar';
import LoginPage from './pages/LoginPage';
import ItemsPage from './pages/ItemsPage';
import ItemFormPage from './pages/ItemFormPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AccountPage from './pages/AccountPage';
import PromoLibraryPage from './pages/PromoLibraryPage';
import PromoBuilderPage from './pages/PromoBuilderPage';
import PromoPrintPage from './pages/PromoPrintPage';
import LoadingSpinner from './components/LoadingSpinner';

function AppLayout() {
  const { loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return (
    <div className="app-shell">
      <SelectionProvider>
        <NavBar />
        <main className="app-main">
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
        </main>
      </SelectionProvider>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
