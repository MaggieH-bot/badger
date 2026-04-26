import { useUIPreferences } from '../../store/useUIPreferences';

interface TeamFilterHiddenBannerProps {
  hiddenCount: number;
}

export function TeamFilterHiddenBanner({ hiddenCount }: TeamFilterHiddenBannerProps) {
  const { preferences, dispatch } = useUIPreferences();

  if (hiddenCount === 0 || preferences.activeTeamFilter === 'All') {
    return null;
  }

  return (
    <div className="filter-hidden-banner" role="status">
      <span className="filter-hidden-banner-text">
        {hiddenCount === 1 ? '1 deal is' : `${hiddenCount} deals are`} hidden by Team:{' '}
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
