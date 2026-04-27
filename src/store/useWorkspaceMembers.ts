import { useEffect, useState } from 'react';
import { listWorkspaceMembers, type WorkspaceMember } from '../api/workspaces';
import { useWorkspace } from './useWorkspace';

/**
 * Loads the current workspace's member list. Refreshes when workspace changes.
 * Stays loading=true on initial mount until the first fetch resolves.
 */
export function useWorkspaceMembers(): {
  members: WorkspaceMember[];
  loading: boolean;
  error: string | null;
} {
  const { workspace } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State setters live only inside async callbacks to satisfy
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!workspace) return;
    let mounted = true;

    listWorkspaceMembers(workspace.id)
      .then((m) => {
        if (!mounted) return;
        setMembers(m);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('[badger] workspace members load failed:', err);
        setError(err instanceof Error ? err.message : 'Could not load members.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [workspace]);

  return { members, loading, error };
}
