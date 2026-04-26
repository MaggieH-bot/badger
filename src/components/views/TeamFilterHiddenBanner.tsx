import { useUIPreferences } from '../../store/useUIPreferences';

type Scope = 'active' | 'closed' | 'workspace';

interface TeamFilterHiddenBannerProps {
  hiddenCount: number;
  scope?: Scope;
}

const SCOPE_NOUN: Record<Scope, { singular: string; plural: string }> = {
  active: { singular: 'active client', plural: 'active clients' },
  closed: { singular: 'closed client', plural: 'closed clients' },
  workspace: { singular: 'client', plural: 'clients' },
};

export function TeamFilterHiddenBanner({
  hiddenCount,
  scope = 'active',
}: TeamFilterHiddenBannerProps) {
  const { preferences, dispatch } = useUIPreferences();

  if (hiddenCount === 0 || preferences.activeTeamFilter === 'All') {
    return null;
  }

  const noun = hiddenCount === 1 ? SCOPE_NOUN[scope].singular : SCOPE_NOUN[scope].plural;
  const verb = hiddenCount === 1 ? 'is' : 'are';

  return (
    <div className="filter-hidden-banner" role="status">
      <span className="filter-hidden-banner-text">
        {hiddenCount} {noun} {verb} hidden by Team:{' '}
        <strong>{preferences.activeTeamFilter}</strong> filter.
      </span>
      <button
        type="button"
        className="filter-hidden-banner-link"
        onClick={() => dispatch({ type: 'SET_TEAM_FILTER', filter: 'All' })}
      >
        Show all
      </button>
    </div>
  );
}
