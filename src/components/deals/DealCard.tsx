import type { DealWithUrgency } from '../../types';
import {
  STAGE_LABELS,
  OPPORTUNITY_TYPE_LABELS,
} from '../../constants/pipeline';

interface DealCardProps {
  deal: DealWithUrgency;
  onClick: (dealId: string) => void;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const daysLabel = deal.neverContacted
    ? 'Never contacted'
    : deal.daysSinceContact === 0
      ? 'today'
      : deal.daysSinceContact === 1
        ? '1 day ago'
        : `${deal.daysSinceContact} days ago`;

  const isClosed = deal.stage === 'closed';
  const showAttention = deal.followUpStatus === 'needs_attention';

  return (
    <button
      className={`deal-card deal-card--${deal.category}${isClosed ? ' deal-card--closed' : ''}`}
      onClick={() => onClick(deal.id)}
      type="button"
    >
      <div className="deal-card-header">
        <span className="deal-card-name">{deal.clientName}</span>
        {showAttention && (
          <span className="attention-pill">Needs Attn</span>
        )}
      </div>
      {deal.address && (
        <div className="deal-card-detail">{deal.address}</div>
      )}
      <div className="deal-card-meta">
        {deal.opportunityType && (
          <span>{OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}</span>
        )}
        {deal.probability !== undefined && (
          <span>{deal.probability}%</span>
        )}
        <span>{STAGE_LABELS[deal.stage]}</span>
        <span>{deal.assignedTo}</span>
        <span>{daysLabel}</span>
        {deal.price !== undefined && (
          <span>{formatPrice(deal.price)}</span>
        )}
      </div>
      {deal.nextAction && (
        <div className="deal-card-next">Next: {deal.nextAction}</div>
      )}
    </button>
  );
}
