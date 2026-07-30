import { createContext, useContext, useEffect, useState } from 'react';
import { subscribeToSession } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true });

  useEffect(() => {
    const unsubscribe = subscribeToSession(({ user, profile }) => {
      setState({ user, profile, loading: false });
    });
    return unsubscribe;
  }, []);

  const value = {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    isAdmin: state.profile?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
