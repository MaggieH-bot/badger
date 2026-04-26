import type {
  UIPreferencesStore,
  TeamFilter,
  AppRoute,
  PipelineViewMode,
} from '../types';

const STORAGE_KEY = 'pipeline_manager_ui_v1';

const VALID_ROUTES: AppRoute[] = ['#/', '#/pipeline', '#/closed', '#/import'];
const VALID_FILTERS: TeamFilter[] = ['All', 'You', 'TC', 'VA', 'Partner'];
const VALID_VIEW_MODES: PipelineViewMode[] = ['table', 'board'];

// Legacy route map: stored value → migrated AppRoute
const ROUTE_MIGRATIONS: Record<string, AppRoute> = {
  '#/deals': '#/pipeline',
};

export const UI_DEFAULTS: UIPreferencesStore = {
  activeTeamFilter: 'All',
  lastRoute: '#/',
  pipelineViewMode: 'table',
};

function isValidRoute(value: unknown): value is AppRoute {
  return typeof value === 'string' && VALID_ROUTES.includes(value as AppRoute);
}

function normalizeRoute(value: unknown): AppRoute {
  if (isValidRoute(value)) return value;
  if (typeof value === 'string' && value in ROUTE_MIGRATIONS) {
    return ROUTE_MIGRATIONS[value];
  }
  return UI_DEFAULTS.lastRoute;
}

function isValidFilter(value: unknown): value is TeamFilter {
  return typeof value === 'string' && VALID_FILTERS.includes(value as TeamFilter);
}

function isValidViewMode(value: unknown): value is PipelineViewMode {
  return typeof value === 'string' && VALID_VIEW_MODES.includes(value as PipelineViewMode);
}

export function loadUIPreferences(): UIPreferencesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...UI_DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...UI_DEFAULTS };

    const obj = parsed as Record<string, unknown>;

    return {
      activeTeamFilter: isValidFilter(obj.activeTeamFilter)
        ? obj.activeTeamFilter
        : UI_DEFAULTS.activeTeamFilter,
      lastRoute: normalizeRoute(obj.lastRoute),
      pipelineViewMode: isValidViewMode(obj.pipelineViewMode)
        ? obj.pipelineViewMode
        : UI_DEFAULTS.pipelineViewMode,
    };
  } catch {
    return { ...UI_DEFAULTS };
  }
}

export function saveUIPreferences(prefs: UIPreferencesStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
