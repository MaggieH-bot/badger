import { useState, useMemo } from 'react';
import type { DealWithUrgency, Category } from '../../types';
import { STAGE_LABELS, CATEGORY_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { computeUrgency } from '../../utils/urgency';
import { TeamFilterHiddenBanner } from './TeamFilterHiddenBanner';

export type DealsTableMode = 'pipeline' | 'closed';

interface DealsTableProps {
  mode: DealsTableMode;
  onSelectDeal: (dealId: string) => void;
}

type SortKey =
  | 'clientName'
  | 'category'
  | 'address'
  | 'stage'
  | 'assignedTo'
  | 'followUp'
  | 'daysSinceContact'
  | 'price'
  | 'nextAction';

type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'clientName', label: 'Client' },
  { key: 'category', label: 'Category' },
  { key: 'stage', label: 'Stage' },
  { key: 'assignedTo', label: 'Assigned' },
  { key: 'followUp', label: 'Follow-up' },
  { key: 'daysSinceContact', label: 'Last Contact' },
  { key: 'address', label: 'Address' },
  { key: 'price', label: 'Price' },
  { key: 'nextAction', label: 'Next Action' },
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
      cmp = (a.price ?? 0) - (b.price ?? 0);
      break;
    case 'nextAction':
      cmp = (a.nextAction ?? '').localeCompare(b.nextAction ?? '');
      break;
  }

  return dir === 'asc' ? cmp : -cmp;
}

export function DealsTable({ mode, onSelectDeal }: DealsTableProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();
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

  const withUrgency = filtered.map((d) => computeUrgency(d));

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
        <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} />
        <div className="empty-state">
          {mode === 'pipeline' ? (
            <>
              <p>No active deals match the current filter.</p>
              <p>Click "+ Add Client" to create a client, or change the team filter.</p>
            </>
          ) : (
            <>
              <p>No closed transactions match the current filter.</p>
              <p>Closed deals will appear here once their stage is set to Closed.</p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} />
      <div className="table-wrap">
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
                <span className={`category-badge category-badge--${deal.category}`}>
                  {CATEGORY_LABELS[deal.category]}
                </span>
              </td>
              <td className="deals-table-td">{STAGE_LABELS[deal.stage]}</td>
              <td className="deals-table-td">{deal.assignedTo}</td>
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
                {deal.price !== undefined ? formatPrice(deal.price) : ''}
              </td>
              <td className="deals-table-td">{deal.nextAction ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
