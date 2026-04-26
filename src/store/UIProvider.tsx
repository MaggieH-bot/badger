import type { ReactNode } from 'react';
import { UIContext, useUIReducer } from './useUIPreferences';

export function UIProvider({ children }: { children: ReactNode }) {
  const { preferences, dispatch } = useUIReducer();

  return (
    <UIContext.Provider value={{ preferences, dispatch }}>
      {children}
    </UIContext.Provider>
  );
}
