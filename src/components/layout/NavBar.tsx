import type { AppRoute, TeamFilter } from '../../types';
import { ASSIGNEES } from '../../constants/pipeline';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useAuth } from '../../store/useAuth';

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

const FILTER_OPTIONS: TeamFilter[] = ['All', ...ASSIGNEES];

export function NavBar({ route, navigate, onAddDeal }: NavBarProps) {
  const { preferences, dispatch } = useUIPreferences();
  const { signOut } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-row navbar-row--top">
        <div className="navbar-brand">
          <span className="navbar-brand-name">BADGER</span>
          <span className="navbar-brand-tagline">Digs up what needs your attention.</span>
        </div>
        <div className="navbar-actions">
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
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
}
