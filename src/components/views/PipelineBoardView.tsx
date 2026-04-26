import type { Stage, DealWithUrgency } from '../../types';
import { ACTIVE_STAGES, STAGE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { computeUrgency } from '../../utils/urgency';
import { DealCard } from '../deals/DealCard';

interface PipelineBoardViewProps {
  onSelectDeal: (dealId: string) => void;
}

export function PipelineBoardView({ onSelectDeal }: PipelineBoardViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();

  // Active pipeline only — exclude closed, then apply team filter
  const filtered = deals.filter(
    (d) =>
      d.stage !== 'closed' &&
      (preferences.activeTeamFilter === 'All' ||
        d.assignedTo === preferences.activeTeamFilter),
  );

  const withUrgency = filtered.map((d) => computeUrgency(d));

  const grouped: Record<Stage, DealWithUrgency[]> = {
    lead: [],
    prospect: [],
    active: [],
    under_contract: [],
    closing: [],
    closed: [],
  };
  for (const deal of withUrgency) {
    grouped[deal.stage].push(deal);
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
              <p className="pipeline-column-empty">No deals</p>
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
