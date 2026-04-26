import type { ReactNode } from 'react';
import { DealsContext, useDealsReducer } from './useDeals';

export function DealsProvider({ children }: { children: ReactNode }) {
  const value = useDealsReducer();
  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>;
}
