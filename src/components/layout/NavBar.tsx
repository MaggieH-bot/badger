import type { AppRoute, TeamFilter } from '../../types';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useAuth } from '../../store/useAuth';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { isLegacyAssignee } from '../../utils/assignee';

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
  const filterOptions: FilterOption[] = [
    { value: 'All', label: 'All' },
    ...sortedMembers.map((m) => ({
      value: m.userId as TeamFilter,
      label:
        m.userId === currentUserId
          ? `You${m.email ? ` (${m.email})` : ''}`
          : m.email ?? 'Workspace member',
    })),
  ];

  // If the persisted filter is a legacy hardcoded value (Partner / TC / VA /
  // 'You' string), append it as a one-time selectable option so the user can
  // see what's set and clear it. New selections come from real members above.
  const persisted = preferences.activeTeamFilter;
  if (
    persisted !== 'All' &&
    isLegacyAssignee(persisted) &&
    !filterOptions.some((opt) => opt.value === persisted)
  ) {
    filterOptions.push({ value: persisted, label: `${persisted} (legacy)` });
  }

  return (
    <nav className="navbar">
      <div className="navbar-row navbar-row--top">
        <div className="navbar-brand">
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
