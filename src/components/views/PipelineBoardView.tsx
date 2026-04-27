import type { Stage, DealWithUrgency } from '../../types';
import { ACTIVE_STAGES, STAGE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { computeUrgency } from '../../utils/urgency';
import { DealCard } from '../deals/DealCard';
import { matchesSearch } from '../../utils/search';

interface PipelineBoardViewProps {
  onSelectDeal: (dealId: string) => void;
  searchQuery?: string;
}

export function PipelineBoardView({
  onSelectDeal,
  searchQuery = '',
}: PipelineBoardViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();

  // Active pipeline only — exclude closed, then apply team filter
  const filtered = deals.filter(
    (d) =>
      d.stage !== 'closed' &&
      (preferences.activeTeamFilter === 'All' ||
        d.assignedTo === preferences.activeTeamFilter),
  );

  // Search overlays on top.
  const searchFiltered = searchQuery
    ? filtered.filter((d) => matchesSearch(d, searchQuery))
    : filtered;
  const isSearching = searchQuery.trim().length > 0;

  const withUrgency = searchFiltered.map((d) => computeUrgency(d));

  const grouped: Record<Stage, DealWithUrgency[]> = {
    lead: [],
    listing: [],
    active_buyer: [],
    under_contract: [],
    closed: [],
  };
  for (const deal of withUrgency) {
    grouped[deal.stage].push(deal);
  }

  if (isSearching && searchFiltered.length === 0) {
    return (
      <div className="empty-state">
        <p>No clients found.</p>
        <p>No match for "{searchQuery.trim()}". Clear the search to see all clients.</p>
      </div>
    );
  }

  return (
    <div className="pipeline-board">
      {ACTIVE_STAGES.map((stage) => (
        <div key={stage} className="pipeline-column">
          <div className="pipeline-column-header">
            <span className="pipeline-column-label">{STAGE_LABELS[stage]}</span>
            <span className="pipeline-column-count">{grouped[stage].length}</span>
          </div>
          <div className="pipeline-column-cards">
            {grouped[stage].length === 0 ? (
              <p className="pipeline-column-empty">No clients</p>
            ) : (
              grouped[stage].map((deal) => (
                <DealCard key={deal.id} deal={deal} onClick={onSelectDeal} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
