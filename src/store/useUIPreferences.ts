import { createContext, useContext, useReducer, useEffect, type Dispatch } from 'react';
import type { UIPreferencesStore, TeamFilter, AppRoute, PipelineViewMode } from '../types';
import { loadUIPreferences, saveUIPreferences } from './uiStorage';

// --- Action types ---

type UIAction =
  | { type: 'SET_TEAM_FILTER'; filter: TeamFilter }
  | { type: 'SET_LAST_ROUTE'; route: AppRoute }
  | { type: 'SET_PIPELINE_VIEW_MODE'; mode: PipelineViewMode };

// --- Reducer ---

function uiReducer(state: UIPreferencesStore, action: UIAction): UIPreferencesStore {
  switch (action.type) {
    case 'SET_TEAM_FILTER':
      return { ...state, activeTeamFilter: action.filter };
    case 'SET_LAST_ROUTE':
      return { ...state, lastRoute: action.route };
    case 'SET_PIPELINE_VIEW_MODE':
      return { ...state, pipelineViewMode: action.mode };
  }
}

// --- Context ---

interface UIContextValue {
  preferences: UIPreferencesStore;
  dispatch: Dispatch<UIAction>;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUIReducer() {
  const [preferences, dispatch] = useReducer(uiReducer, null, loadUIPreferences);

  useEffect(() => {
    saveUIPreferences(preferences);
  }, [preferences]);

  return { preferences, dispatch };
}

export function useUIPreferences(): UIContextValue {
  const ctx = useContext(UIContext);
  if (ctx === null) {
    throw new Error('useUIPreferences must be used within a UIProvider');
  }
  return ctx;
}

export type { UIAction };
