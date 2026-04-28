import { useState, useMemo } from 'react';
import type { DealWithUrgency, Category } from '../../types';
import { STAGE_LABELS, CATEGORY_LABELS, OPPORTUNITY_TYPE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { computeUrgency } from '../../utils/urgency';
import { displayAssignee } from '../../utils/assignee';
import { TeamFilterHiddenBanner } from './TeamFilterHiddenBanner';
import { DealCard } from '../deals/DealCard';
import { matchesSearch } from '../../utils/search';
import { formatPriceRange } from '../../utils/priceRange';

export type DealsTableMode = 'pipeline' | 'closed';

interface DealsTableProps {
  mode: DealsTableMode;
  onSelectDeal: (dealId: string) => void;
  searchQuery?: string;
}

type SortKey =
  | 'clientName'
  | 'category'
  | 'address'
  | 'opportunityType'
  | 'stage'
  | 'assignedTo'
  | 'followUp'
  | 'daysSinceContact'
  | 'price'
  | 'nextStep';

type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'clientName', label: 'Client' },
  { key: 'category', label: 'Category' },
  { key: 'opportunityType', label: 'Type' },
  { key: 'stage', label: 'Stage' },
  { key: 'assignedTo', label: 'Assigned' },
  { key: 'followUp', label: 'Follow-up' },
  { key: 'daysSinceContact', label: 'Last Contact' },
  { key: 'address', label: 'Address' },
  { key: 'price', label: 'Price' },
  { key: 'nextStep', label: 'Next Step' },
];

const FOLLOWUP_SORT_ORDER: Record<string, number> = {
  needs_attention: 0,
  on_track: 1,
  none: 2,
};

const CATEGORY_SORT_ORDER: Record<Category, number> = {
  hot: 0,
  nurture: 1,
  watch: 2,
};

const FOLLOWUP_DISPLAY: Record<string, string> = {
  needs_attention: 'Needs Attention',
  on_track: 'On Track',
  none: '—',
};

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

// Pick the price to render for a row, in priority order:
//   1. Closed → closed_price
//   2. Seller (Listing/Under Contract) → list_price
//   3. Buyer (Active Buyer/Under Contract) → midpoint of price range
//   4. Legacy single price column (deprecated)
function displayPrice(deal: DealWithUrgency): number | undefined {
  if (deal.stage === 'closed' && deal.closedPrice !== undefined) {
    return deal.closedPrice;
  }
  if (deal.listPrice !== undefined) return deal.listPrice;
  if (deal.priceRangeLow !== undefined && deal.priceRangeHigh !== undefined) {
    return (deal.priceRangeLow + deal.priceRangeHigh) / 2;
  }
  if (deal.priceRangeLow !== undefined) return deal.priceRangeLow;
  if (deal.priceRangeHigh !== undefined) return deal.priceRangeHigh;
  return deal.price;
}

function formatPriceCell(deal: DealWithUrgency): string {
  // Buyer ranges use the locked range format ("$800,000 – $950,000",
  // "$800,000+", or "Up to $950,000") so the bounds read clearly. Single
  // prices stay in the column's compact currency format.
  if (
    deal.stage !== 'closed' &&
    deal.listPrice === undefined
  ) {
    const range = formatPriceRange(deal.priceRangeLow, deal.priceRangeHigh);
    if (range) return range;
  }
  const p = displayPrice(deal);
  return p !== undefined ? formatPrice(p) : '';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function compareDeal(a: DealWithUrgency, b: DealWithUrgency, key: SortKey, dir: SortDir): number {
  let cmp = 0;

  switch (key) {
    case 'clientName':
      cmp = a.clientName.localeCompare(b.clientName);
      break;
    case 'category':
      cmp = CATEGORY_SORT_ORDER[a.category] - CATEGORY_SORT_ORDER[b.category];
      break;
    case 'address':
      cmp = (a.address ?? '').localeCompare(b.address ?? '');
      break;
    case 'opportunityType':
      cmp = (a.opportunityType ?? '').localeCompare(b.opportunityType ?? '');
      break;
    case 'stage':
      cmp = STAGE_LABELS[a.stage].localeCompare(STAGE_LABELS[b.stage]);
      break;
    case 'assignedTo':
      cmp = a.assignedTo.localeCompare(b.assignedTo);
      break;
    case 'followUp':
      cmp = FOLLOWUP_SORT_ORDER[a.followUpStatus] - FOLLOWUP_SORT_ORDER[b.followUpStatus];
      break;
    case 'daysSinceContact':
      cmp = a.daysSinceContact - b.daysSinceContact;
      break;
    case 'price':
      cmp = (displayPrice(a) ?? 0) - (displayPrice(b) ?? 0);
      break;
    case 'nextStep':
      cmp = (a.nextStep ?? '').localeCompare(b.nextStep ?? '');
      break;
  }

  return dir === 'asc' ? cmp : -cmp;
}

export function DealsTable({ mode, onSelectDeal, searchQuery = '' }: DealsTableProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const [sortKey, setSortKey] = useState<SortKey>('daysSinceContact');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Stage filter by mode (active vs closed) — used to compute filter-hidden count
  const stageMatched = deals.filter((d) => {
    if (mode === 'pipeline' && d.stage === 'closed') return false;
    if (mode === 'closed' && d.stage !== 'closed') return false;
    return true;
  });

  // Then apply team filter
  const filtered = stageMatched.filter(
    (d) =>
      preferences.activeTeamFilter === 'All' ||
      d.assignedTo === preferences.activeTeamFilter,
  );

  const hiddenByTeamFilter = stageMatched.length - filtered.length;

  // Search overlays on top of the team filter without replacing it.
  const searchFiltered = searchQuery
    ? filtered.filter((d) => matchesSearch(d, searchQuery))
    : filtered;
  const isSearching = searchQuery.trim().length > 0;
  const hiddenBySearch = filtered.length - searchFiltered.length;

  const withUrgency = searchFiltered.map((d) => computeUrgency(d));

  const sorted = useMemo(
    () => [...withUrgency].sort((a, b) => compareDeal(a, b, sortKey, sortDir)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(withUrgency), sortKey, sortDir],
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey): string {
    if (key !== sortKey) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  if (sorted.length === 0) {
    return (
      <>
        <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope={mode === 'pipeline' ? 'active' : 'closed'} />
        <div className="empty-state">
          {isSearching && hiddenBySearch > 0 ? (
            <>
              <p>No clients found.</p>
              <p>No match for "{searchQuery.trim()}". Clear the search to see all clients.</p>
            </>
          ) : mode === 'pipeline' ? (
            <>
              <p>No active clients match the current filter.</p>
              <p>Click "+ Add Client" to create a client, or change the team filter.</p>
            </>
          ) : (
            <>
              <p>No closed transactions match the current filter.</p>
              <p>Closed clients will appear here once their stage is set to Closed.</p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope={mode === 'pipeline' ? 'active' : 'closed'} />

      <div className="deals-cards-mobile">
        {sorted.map((deal) => (
          <DealCard key={deal.id} deal={deal} onClick={onSelectDeal} />
        ))}
      </div>

      <div className="table-wrap deals-table-desktop">
      <table className="deals-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="deals-table-th"
                onClick={() => handleSort(col.key)}
              >
                {col.label}{sortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((deal) => (
            <tr
              key={deal.id}
              className="deals-table-row"
              onClick={() => onSelectDeal(deal.id)}
            >
              <td className="deals-table-td deals-table-td--name">{deal.clientName}</td>
              <td className="deals-table-td">
                {deal.stage === 'closed' ? (
                  <span className="status-badge status-badge--closed">Closed</span>
                ) : (
                  <span className={`category-badge category-badge--${deal.category}`}>
                    {CATEGORY_LABELS[deal.category]}
                  </span>
                )}
              </td>
              <td className="deals-table-td">
                {deal.opportunityType ? (
                  <span
                    className={`opp-type-pill opp-type-pill--${deal.opportunityType}`}
                  >
                    {OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}
                  </span>
                ) : (
                  <span className="followup-muted">—</span>
                )}
              </td>
              <td className="deals-table-td">{STAGE_LABELS[deal.stage]}</td>
              <td className="deals-table-td">
                {displayAssignee(deal.assignedTo, members)}
              </td>
              <td className="deals-table-td">
                {deal.followUpStatus === 'needs_attention' ? (
                  <span className="attention-pill">Needs Attention</span>
                ) : (
                  <span className="followup-muted">{FOLLOWUP_DISPLAY[deal.followUpStatus]}</span>
                )}
              </td>
              <td className="deals-table-td">
                {deal.neverContacted ? (
                  <span className="deals-table-never">Never contacted</span>
                ) : (
                  <>
                    {formatDate(deal.lastContact!)}
                    <span className="deals-table-days">
                      {deal.daysSinceContact === 0
                        ? 'today'
                        : deal.daysSinceContact === 1
                          ? '1d ago'
                          : `${deal.daysSinceContact}d ago`}
                    </span>
                  </>
                )}
              </td>
              <td className="deals-table-td">{deal.address ?? ''}</td>
              <td className="deals-table-td deals-table-td--price">
                {formatPriceCell(deal)}
              </td>
              <td className="deals-table-td">
                {deal.nextStep ? (
                  <>
                    {deal.nextStep}
                    {deal.nextStepDue && (
                      <span className="deals-table-due">
                        {' '}— due {new Date(deal.nextStepDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </>
                ) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
