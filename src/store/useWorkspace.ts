import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Workspace } from '../api/workspaces';
import { ensureWorkspaceForCurrentUser } from '../api/workspaces';
import { useAuth } from './useAuth';

export interface WorkspaceContextValue {
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceState(): WorkspaceContextValue {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // State setters live only in async callbacks to satisfy
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!user) return;
    let mounted = true;

    ensureWorkspaceForCurrentUser(user.id, user.email ?? null)
      .then((ws) => {
        if (!mounted) return;
        setWorkspace(ws);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('[badger] workspace setup failed:', err);
        const message =
          err instanceof Error ? err.message : 'Could not set up your workspace.';
        setError(message);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user, retryToken]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryToken((t) => t + 1);
  }, []);

  return { workspace, loading, error, retry };
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (ctx === null) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
