import { useEffect } from 'react';
import type { AppRoute, TeamFilter } from '../../types';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useAuth } from '../../store/useAuth';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';

interface NavBarProps {
  route: AppRoute;
  navigate: (to: AppRoute) => void;
  onAddDeal: () => void;
}

const NAV_ITEMS: { route: AppRoute; label: string }[] = [
  { route: '#/', label: 'Today' },
  { route: '#/pipeline', label: 'Pipeline' },
  { route: '#/closed', label: 'Closed Transactions' },
];

interface FilterOption {
  value: TeamFilter;
  label: string;
}

export function NavBar({ route, navigate, onAddDeal }: NavBarProps) {
  const { preferences, dispatch } = useUIPreferences();
  const { signOut, user } = useAuth();
  const { members } = useWorkspaceMembers();

  const currentUserId = user?.id ?? null;

  // Build the Team filter options dynamically from real workspace members.
  // "All" is always present; current user shows as "You"; others show by email.
  // If the user has a stale legacy filter persisted (e.g. 'Partner'), surface
  // it once so the dropdown displays a coherent value rather than blank.
  const sortedMembers = [...members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
  });
  // Filter options are All + every member that has an email we can show.
  // Members we can't identify are excluded so the dropdown never reads
  // "Workspace member" or any legacy placeholder.
  const filterOptions: FilterOption[] = [
    { value: 'All', label: 'All' },
    ...sortedMembers
      .filter((m) => m.email && m.email.trim())
      .map((m) => ({
        value: m.userId as TeamFilter,
        label: m.email ?? '',
      })),
  ];

  // If a stale filter value is persisted (legacy 'Partner' / 'You' / unknown
  // UUID), reset it to 'All' so the dropdown isn't out of sync with what the
  // user can actually pick.
  const persisted = preferences.activeTeamFilter;
  const persistedValid = filterOptions.some((opt) => opt.value === persisted);
  useEffect(() => {
    if (!persistedValid && members.length > 0) {
      dispatch({ type: 'SET_TEAM_FILTER', filter: 'All' });
    }
  }, [persistedValid, members.length, dispatch]);

  return (
    <nav className="navbar">
      <div className="navbar-row navbar-row--top">
        <div className="navbar-brand">
          {/* Temporary brand icon — simple stylized "badger stripes" mark on a
              rounded square. Replace with a real asset when one exists. */}
          <svg
            className="navbar-brand-icon"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            aria-hidden="true"
          >
            <rect
              x="2"
              y="2"
              width="24"
              height="24"
              rx="6"
              fill="var(--bg-elevated)"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <rect x="9" y="7" width="2.5" height="14" rx="1.25" fill="var(--accent)" />
            <rect x="16.5" y="7" width="2.5" height="14" rx="1.25" fill="var(--accent)" />
          </svg>
          <span className="navbar-brand-name">BADGER</span>
        </div>
        <div className="navbar-actions">
          <button
            type="button"
            className={`navbar-link${route === '#/workspace' ? ' navbar-link--active' : ''}`}
            onClick={() => navigate('#/workspace')}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`navbar-link${route === '#/import' ? ' navbar-link--active' : ''}`}
            onClick={() => navigate('#/import')}
          >
            Import
          </button>
          <button
            type="button"
            className="navbar-link"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
          <button className="btn btn--primary btn--nav" onClick={onAddDeal}>
            + Add Client
          </button>
        </div>
      </div>
      <div className="navbar-row navbar-row--bottom">
        <div className="navbar-tabs">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              className={`nav-tab${route === item.route ? ' nav-tab--active' : ''}`}
              onClick={() => navigate(item.route)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="navbar-filter">
          <label htmlFor="team-filter">Team:</label>
          <select
            id="team-filter"
            value={preferences.activeTeamFilter}
            onChange={(e) =>
              dispatch({
                type: 'SET_TEAM_FILTER',
                filter: e.target.value as TeamFilter,
              })
            }
          >
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
}
