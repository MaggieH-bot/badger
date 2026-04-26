import type { ReactNode } from 'react';
import { WorkspaceContext, useWorkspaceState } from './useWorkspace';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceState();
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
