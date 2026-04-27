import type { DealWithUrgency } from '../../types';
import {
  STAGE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
} from '../../constants/pipeline';
import { useAuth } from '../../store/useAuth';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { displayAssignee } from '../../utils/assignee';

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
function priceSummary(deal: DealWithUrgency): string | null {
  if (deal.stage === 'closed' && deal.closedPrice !== undefined) {
    return formatPriceShort(deal.closedPrice);
  }
  if (deal.listPrice !== undefined) return formatPriceShort(deal.listPrice);
  if (deal.priceRangeLow !== undefined || deal.priceRangeHigh !== undefined) {
    const lo = deal.priceRangeLow !== undefined ? formatPriceShort(deal.priceRangeLow) : '';
    const hi = deal.priceRangeHigh !== undefined ? formatPriceShort(deal.priceRangeHigh) : '';
    if (lo && hi) return `${lo}–${hi}`;
    return lo || hi || null;
  }
  if (deal.price !== undefined) return formatPriceShort(deal.price);
  return null;
}

function dueLabel(due: string): string {
  return new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const { user } = useAuth();
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
  const assigneeLabel = displayAssignee(deal.assignedTo, members, user?.id ?? null);

  return (
    <button
      className={`deal-card deal-card--${deal.category}${isClosed ? ' deal-card--closed' : ''}`}
      onClick={() => onClick(deal.id)}
      type="button"
    >
      <div className="deal-card-header">
        <span className="deal-card-name">{deal.clientName}</span>
        {deal.opportunityType && (
          <span
            className={`opp-type-pill opp-type-pill--${deal.opportunityType}`}
            aria-label={`Opportunity type: ${OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}`}
          >
            {OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}
          </span>
        )}
        {showAttention && (
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
