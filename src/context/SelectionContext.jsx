import { createContext, useContext, useState } from 'react';

// Lets ItemsPage's multi-select mode hide the bottom nav/FAB in NavBar, a
// sibling component, without threading props through the router.
const SelectionContext = createContext(null);

export function SelectionProvider({ children }) {
  const [selecting, setSelecting] = useState(false);
  return <SelectionContext.Provider value={{ selecting, setSelecting }}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}
