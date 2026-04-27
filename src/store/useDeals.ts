import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
  type Dispatch,
} from 'react';
import type { Deal, ContactLogEntry, Note, Document } from '../types';
import { fetchDealsForWorkspace } from '../api/deals';
import { persistAction } from '../api/persistAction';
import { useWorkspace } from './useWorkspace';
import { useAuth } from './useAuth';

// --- Action types ---

type DealsAction =
  | { type: '__HYDRATE__'; deals: Deal[] }
  | { type: 'ADD_DEAL'; deal: Deal }
  | { type: 'ADD_DEALS'; deals: Deal[] }
  | { type: 'UPDATE_DEAL'; deal: Deal }
  | { type: 'DELETE_DEAL'; dealId: string }
  | { type: 'ADD_CONTACT_LOG'; dealId: string; entry: ContactLogEntry }
  | { type: 'ADD_NOTE'; dealId: string; note: Note }
  | { type: 'UPDATE_NOTE'; dealId: string; note: Note }
  | { type: 'DELETE_NOTE'; dealId: string; noteId: string }
  | { type: 'ADD_DOCUMENT'; dealId: string; document: Document }
  | { type: 'UPDATE_DOCUMENT'; dealId: string; document: Document }
  | { type: 'DELETE_DOCUMENT'; dealId: string; documentId: string; filePath?: string };

// --- Reducer (in-memory only; persistence is handled by the dispatch wrapper) ---

function updateDealInList(
  deals: Deal[],
  dealId: string,
  updater: (deal: Deal) => Deal,
): Deal[] {
  return deals.map((d) => (d.id === dealId ? updater(d) : d));
}

function dealsReducer(state: Deal[], action: DealsAction): Deal[] {
  const now = new Date().toISOString();

  switch (action.type) {
    case '__HYDRATE__':
      return action.deals;

    case 'ADD_DEAL':
      return [...state, action.deal];

    case 'ADD_DEALS':
      return [...state, ...action.deals];

    case 'UPDATE_DEAL':
      return updateDealInList(state, action.deal.id, () => ({
        ...action.deal,
        updatedAt: now,
      }));

    case 'DELETE_DEAL':
      return state.filter((d) => d.id !== action.dealId);

    case 'ADD_CONTACT_LOG':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        contactLog: [...deal.contactLog, action.entry],
        lastContact: action.entry.timestamp,
        updatedAt: now,
      }));

    case 'ADD_NOTE':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        notes: [...deal.notes, action.note],
        updatedAt: now,
      }));

    case 'UPDATE_NOTE':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        notes: deal.notes.map((n) =>
          n.id === action.note.id ? action.note : n,
        ),
        updatedAt: now,
      }));

    case 'DELETE_NOTE':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        notes: deal.notes.filter((n) => n.id !== action.noteId),
        updatedAt: now,
      }));

    case 'ADD_DOCUMENT':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        documents: [...deal.documents, action.document],
        updatedAt: now,
      }));

    case 'UPDATE_DOCUMENT':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        documents: deal.documents.map((doc) =>
          doc.id === action.document.id ? action.document : doc,
        ),
        updatedAt: now,
      }));

    case 'DELETE_DOCUMENT':
      return updateDealInList(state, action.dealId, (deal) => ({
        ...deal,
        documents: deal.documents.filter((doc) => doc.id !== action.documentId),
        updatedAt: now,
      }));
  }
}

// --- Context ---

const WRITE_ERROR_MESSAGE = "Couldn't save changes. Refresh to sync.";

export interface DealsContextValue {
  deals: Deal[];
  dispatch: Dispatch<DealsAction>;
  loading: boolean;
  fetchError: string | null;
  writeError: string | null;
  retryFetch: () => void;
  dismissWriteError: () => void;
}

export const DealsContext = createContext<DealsContextValue | null>(null);

export function useDealsReducer(): DealsContextValue {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const [deals, baseDispatch] = useReducer(dealsReducer, [] as Deal[]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [fetchToken, setFetchToken] = useState(0);

  // Initial fetch (and re-fetches via retry).
  // State setters live only in async callbacks to satisfy the
  // react-hooks/set-state-in-effect rule.
  useEffect(() => {
    if (!workspace) return;
    let mounted = true;

    fetchDealsForWorkspace(workspace.id)
      .then((initial) => {
        if (!mounted) return;
        baseDispatch({ type: '__HYDRATE__', deals: initial });
        setFetchError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error('[badger] initial fetch failed:', err);
        const message =
          err instanceof Error ? err.message : 'Failed to load pipeline.';
        setFetchError(message);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [workspace, fetchToken]);

  const retryFetch = useCallback(() => {
    setFetchError(null);
    setLoading(true);
    setFetchToken((t) => t + 1);
  }, []);
  const dismissWriteError = useCallback(() => setWriteError(null), []);

  // Wrapped dispatch: optimistic local update + Supabase persistence per action.
  // Hydration short-circuits before persistAction.
  const dispatch = useCallback<Dispatch<DealsAction>>(
    (action) => {
      baseDispatch(action);

      if (action.type === '__HYDRATE__') return;

      if (!workspace) {
        // Should not happen — DealsProvider only mounts after workspace resolves.
        console.error('[badger] dispatch fired before workspace ready');
        setWriteError(WRITE_ERROR_MESSAGE);
        return;
      }

      void persistAction(action, workspace.id, user?.id ?? null).catch((err) => {
        console.error('[badger] persistence failed:', err);
        setWriteError(WRITE_ERROR_MESSAGE);
      });
    },
    [workspace, user],
  );

  return {
    deals,
    dispatch,
    loading,
    fetchError,
    writeError,
    retryFetch,
    dismissWriteError,
  };
}

export function useDeals(): DealsContextValue {
  const ctx = useContext(DealsContext);
  if (ctx === null) {
    throw new Error('useDeals must be used within a DealsProvider');
  }
  return ctx;
}

export type { DealsAction };
