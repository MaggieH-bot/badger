import type { DealWithUrgency } from '../../types';
import {
  STAGE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
} from '../../constants/pipeline';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { displayAssignee } from '../../utils/assignee';
import { formatPriceRange } from '../../utils/priceRange';

interface DealCardProps {
  deal: DealWithUrgency;
  onClick: (dealId: string) => void;
}

function formatPriceShort(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (price >= 1_000) {
    return `$${Math.round(price / 1_000)}K`;
  }
  return `$${price}`;
}

// Card-level price summary, context-aware per Type × Stage.
// Single prices use the K/M short form to save space on cards; buyer ranges
// use the full comma format so the bounds read clearly.
function priceSummary(deal: DealWithUrgency): string | null {
  if (deal.stage === 'closed' && deal.closedPrice !== undefined) {
    return formatPriceShort(deal.closedPrice);
  }
  if (deal.listPrice !== undefined) return formatPriceShort(deal.listPrice);
  const range = formatPriceRange(deal.priceRangeLow, deal.priceRangeHigh);
  if (range) return range;
  if (deal.price !== undefined) return formatPriceShort(deal.price);
  return null;
}

function dueLabel(due: string): string {
  return new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const { members } = useWorkspaceMembers();

  const daysLabel = deal.neverContacted
    ? 'Never contacted'
    : deal.daysSinceContact === 0
      ? 'today'
      : deal.daysSinceContact === 1
        ? '1 day ago'
        : `${deal.daysSinceContact} days ago`;

  const isClosed = deal.stage === 'closed';
  const showAttention = deal.followUpStatus === 'needs_attention';
  const price = priceSummary(deal);
  const assigneeLabel = displayAssignee(deal.assignedTo, members);

  return (
    <button
      className={
        isClosed
          ? 'deal-card deal-card--closed'
          : `deal-card deal-card--${deal.category}`
      }
      onClick={() => onClick(deal.id)}
      type="button"
    >
      <div className="deal-card-header">
        <span className="deal-card-name">{deal.clientName}</span>
        {isClosed && (
          <span className="status-badge status-badge--closed">Closed</span>
        )}
        {deal.opportunityType && (
          <span
            className={`opp-type-pill opp-type-pill--${deal.opportunityType}`}
            aria-label={`Opportunity type: ${OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}`}
          >
            {OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}
          </span>
        )}
        {showAttention && !isClosed && (
          <span className="attention-pill">Needs Attn</span>
        )}
      </div>
      {deal.address && (
        <div className="deal-card-detail">{deal.address}</div>
      )}
      <div className="deal-card-meta">
        {deal.probability !== undefined && (
          <span>{deal.probability}%</span>
        )}
        <span>{STAGE_LABELS[deal.stage]}</span>
        <span>{assigneeLabel}</span>
        <span>{daysLabel}</span>
        {price && <span>{price}</span>}
      </div>
      {deal.nextStep && (
        <div className="deal-card-next">
          Next: {deal.nextStep}
          {deal.nextStepDue && (
            <span className="deal-card-due"> — due {dueLabel(deal.nextStepDue)}</span>
          )}
        </div>
      )}
    </button>
  );
}
