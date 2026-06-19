import { useState, useMemo, Fragment, type ReactNode } from 'react';
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

export type DealsTableMode = 'pipeline' | 'closed' | 'archived';

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
  | 'daysSinceContact'
  | 'price'
  | 'nextStep'
  | 'dueDate';

type SortDir = 'asc' | 'desc';

interface Column {
  key: SortKey;
  label: string;
}

// Pipeline view: action-driven set per the Today/Pipeline cleanup spec.
// Drops Follow-Up, Address, Price; splits Next Step into Next Step + Due Date.
const PIPELINE_COLUMNS: Column[] = [
  { key: 'clientName', label: 'Client' },
  { key: 'opportunityType', label: 'Type' },
  { key: 'stage', label: 'Stage' },
  { key: 'category', label: 'Category' },
  { key: 'nextStep', label: 'Next Step' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'daysSinceContact', label: 'Last Contact' },
  { key: 'assignedTo', label: 'Assigned To' },
];

// Closed view: unchanged from prior behavior. Stage/Follow-Up are dropped here
// because every record is closed and cadence no longer applies.
const CLOSED_COLUMNS: Column[] = [
  { key: 'clientName', label: 'Client' },
  { key: 'category', label: 'Status' },
  { key: 'opportunityType', label: 'Type' },
  { key: 'assignedTo', label: 'Assigned' },
  { key: 'daysSinceContact', label: 'Last Contact' },
  { key: 'address', label: 'Address' },
  { key: 'price', label: 'Price' },
  { key: 'nextStep', label: 'Next Step' },
];

const CATEGORY_SORT_ORDER: Record<Category, number> = {
  hot: 0,
  nurture: 1,
  watch: 2,
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

function formatDueDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Last-name sort key: take the last whitespace-separated token, strip
// surrounding punctuation, lowercase. "Denise & Chris Hartzler" → "hartzler",
// "ABC Realty LLC" → "llc" (V1 fallback for company/team names).
// We pair it with a full-name tiebreaker so siblings sort stably.
function lastNameKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1];
  // Trim leading/trailing non-alphanumerics; keep internal hyphens/apostrophes
  // ("Beth-Smith", "O'Connor").
  const cleaned = last.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return (cleaned || trimmed).toLowerCase();
}

function compareDeal(a: DealWithUrgency, b: DealWithUrgency, key: SortKey, dir: SortDir): number {
  let cmp = 0;

  switch (key) {
    case 'clientName': {
      // Sort by last name (last whitespace-separated token), with full-name as
      // a tiebreaker so two "Smith" households retain a stable order.
      const ak = lastNameKey(a.clientName);
      const bk = lastNameKey(b.clientName);
      cmp = ak.localeCompare(bk);
      if (cmp === 0) cmp = a.clientName.localeCompare(b.clientName);
      break;
    }
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
    case 'daysSinceContact':
      cmp = a.daysSinceContact - b.daysSinceContact;
      break;
    case 'price':
      cmp = (displayPrice(a) ?? 0) - (displayPrice(b) ?? 0);
      break;
    case 'nextStep':
      cmp = (a.nextStep ?? '').localeCompare(b.nextStep ?? '');
      break;
    case 'dueDate': {
      // Empty due dates sort last in either direction.
      const ad = a.nextStepDue ?? '';
      const bd = b.nextStepDue ?? '';
      if (ad && !bd) cmp = -1;
      else if (!ad && bd) cmp = 1;
      else cmp = ad.localeCompare(bd);
      break;
    }
  }

  return dir === 'asc' ? cmp : -cmp;
}

export function DealsTable({ mode, onSelectDeal, searchQuery = '' }: DealsTableProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const isClosed = mode === 'closed';
  const columns = isClosed ? CLOSED_COLUMNS : PIPELINE_COLUMNS;
  const bannerScope =
    mode === 'pipeline' ? 'active' : mode === 'closed' ? 'closed' : 'archived';

  // Default sort: pipeline goes by client last name A–Z; closed keeps the
  // prior Last-Contact-desc behavior.
  const [sortKey, setSortKey] = useState<SortKey>(
    isClosed ? 'daysSinceContact' : 'clientName',
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    isClosed ? 'desc' : 'asc',
  );
  // 15W-70 Phase 2: which linked-pair groups are expanded (desktop pipeline
  // table only). Keyed by a stable pair key; default collapsed.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Mode filter — used to compute filter-hidden count. Archived is orthogonal
  // to stage: the Archived view shows only archived records; the active and
  // closed views exclude archived entirely.
  const stageMatched = deals.filter((d) => {
    if (mode === 'archived') return Boolean(d.archived);
    if (d.archived) return false;
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

  // 15W-70 Phase 2: collapse linked buy/sell pairs into one parent row — but
  // ONLY in the desktop pipeline table, and ONLY when both sides survive the
  // current filter/search (so a pair sorts to its first side's slot). If only
  // one side is in view, it renders as a normal single row. Other modes never
  // group.
  type RowEntry =
    | { kind: 'single'; deal: DealWithUrgency }
    | { kind: 'group'; key: string; sides: DealWithUrgency[] };

  const rowEntries = useMemo<RowEntry[]>(() => {
    if (mode !== 'pipeline') {
      return sorted.map((deal) => ({ kind: 'single' as const, deal }));
    }
    const inView = new Set(sorted.map((d) => d.id));
    // Treat the link as symmetric: if EITHER side references the other (and both
    // are in view), they form one pair. This both prevents a pair from rendering
    // as a standalone row AND a grouped child, and keeps grouping robust to a
    // legacy one-directional link (sell→buy with the buy back-link missing).
    const partnerOf = new Map<string, string>();
    for (const d of sorted) {
      if (d.linkedDealId && inView.has(d.linkedDealId)) {
        partnerOf.set(d.id, d.linkedDealId);
        partnerOf.set(d.linkedDealId, d.id);
      }
    }
    const consumed = new Set<string>();
    const entries: RowEntry[] = [];
    for (const deal of sorted) {
      if (consumed.has(deal.id)) continue;
      const partnerId = partnerOf.get(deal.id);
      if (partnerId && !consumed.has(partnerId)) {
        const partner = sorted.find((d) => d.id === partnerId)!;
        consumed.add(deal.id);
        consumed.add(partnerId);
        entries.push({
          kind: 'group',
          key: [deal.id, partnerId].sort().join('|'),
          sides: [deal, partner],
        });
      } else {
        // Mark singles consumed too, so a partner processed later can never
        // re-pull an already-emitted row into a group.
        consumed.add(deal.id);
        entries.push({ kind: 'single', deal });
      }
    }
    return entries;
  }, [sorted, mode]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Collapsed parent summary, e.g. "Sell: Listing · Buy: Lead".
  function sideSummary(sides: DealWithUrgency[]): string {
    return sides
      .map(
        (s) =>
          `${s.opportunityType ? OPPORTUNITY_TYPE_LABELS[s.opportunityType] : '—'}: ${STAGE_LABELS[s.stage]}`,
      )
      .join(' · ');
  }

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

  // Single dispatcher for cell content, keyed by column. Both modes share most
  // cells; only category renders differently in closed mode (Closed badge).
  function renderCell(deal: DealWithUrgency, key: SortKey): ReactNode {
    switch (key) {
      case 'clientName':
        return deal.clientName;
      case 'category':
        return deal.stage === 'closed' ? (
          <span className="status-badge status-badge--closed">Closed</span>
        ) : (
          <span className={`category-badge category-badge--${deal.category}`}>
            {CATEGORY_LABELS[deal.category]}
          </span>
        );
      case 'opportunityType':
        return deal.opportunityType ? (
          <span className={`opp-type-pill opp-type-pill--${deal.opportunityType}`}>
            {OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}
          </span>
        ) : (
          <span className="followup-muted">—</span>
        );
      case 'stage':
        return STAGE_LABELS[deal.stage];
      case 'assignedTo':
        return displayAssignee(deal.assignedTo, members);
      case 'daysSinceContact':
        return deal.neverContacted ? (
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
        );
      case 'address':
        return deal.address ?? '';
      case 'price':
        return formatPriceCell(deal);
      case 'nextStep':
        return deal.nextStep ?? '';
      case 'dueDate':
        return deal.nextStepDue ? formatDueDateShort(deal.nextStepDue) : '';
    }
  }

  const cellClassFor = (key: SortKey): string => {
    const base = 'deals-table-td';
    if (key === 'clientName') return `${base} deals-table-td--name`;
    if (key === 'price') return `${base} deals-table-td--price`;
    return base;
  };

  // A normal data row — used for standalone deals and for the expanded
  // sub-rows of a linked pair. Sub-rows swap the client-name cell for the
  // side label (the parent already carries the name) and indent.
  const renderDataRow = (deal: DealWithUrgency, isSub = false): ReactNode => (
    <tr
      key={deal.id}
      className={`deals-table-row${isSub ? ' deals-table-row--sub' : ''}`}
      onClick={() => onSelectDeal(deal.id)}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          className={`${cellClassFor(col.key)}${
            isSub && col.key === 'clientName' ? ' deals-table-td--sub-name' : ''
          }`}
        >
          {isSub && col.key === 'clientName' ? (
            <span className="deals-table-sub-label">
              ↳{' '}
              {deal.opportunityType
                ? `${OPPORTUNITY_TYPE_LABELS[deal.opportunityType]} side`
                : 'Side'}
            </span>
          ) : (
            renderCell(deal, col.key)
          )}
        </td>
      ))}
    </tr>
  );

  // The collapsed parent of a linked pair: a container row (chevron + name +
  // "Both" pill + per-side stage summary). Clicking toggles expand only — it
  // never opens a record. Expanding reveals the two sub-rows.
  const renderGroupRows = (
    key: string,
    sides: DealWithUrgency[],
  ): ReactNode => {
    const isOpen = expandedGroups.has(key);
    const client = sides[0].clientName;
    return (
      <Fragment key={key}>
        <tr
          className="deals-table-row deals-table-row--group"
          onClick={() => toggleGroup(key)}
          aria-expanded={isOpen}
        >
          {columns.map((col) => {
            if (col.key === 'clientName') {
              return (
                <td key={col.key} className={cellClassFor(col.key)}>
                  <span className="deals-table-chevron" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>{' '}
                  {client}
                </td>
              );
            }
            if (col.key === 'opportunityType') {
              return (
                <td key={col.key} className={cellClassFor(col.key)}>
                  <span className="opp-type-pill opp-type-pill--both">Both</span>
                </td>
              );
            }
            if (col.key === 'stage') {
              return (
                <td key={col.key} className={cellClassFor(col.key)}>
                  <span className="deals-table-group-summary">
                    {sideSummary(sides)}
                  </span>
                </td>
              );
            }
            return <td key={col.key} className={cellClassFor(col.key)} />;
          })}
        </tr>
        {isOpen && sides.map((side) => renderDataRow(side, true))}
      </Fragment>
    );
  };

  if (sorted.length === 0) {
    return (
      <>
        <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope={bannerScope} />
        <div className="empty-state">
          {isSearching && hiddenBySearch > 0 ? (
            <>
              <p>Nothing matches that.</p>
              <p>No one called "{searchQuery.trim()}". Clear the search to see everyone.</p>
            </>
          ) : mode === 'pipeline' ? (
            <>
              <p>No clients fit this filter.</p>
              <p>Loosen the team filter, or hit "+ Add Client" to start one.</p>
            </>
          ) : mode === 'archived' ? (
            <>
              <p>The Den is empty.</p>
              <p>Tuck a stalled client into the Den from their record to set it aside without deleting.</p>
            </>
          ) : (
            <>
              <p>No closed deals here yet.</p>
              <p>Wins land here the moment a client's stage flips to Closed.</p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope={bannerScope} />

      <div className="deals-cards-mobile">
        {sorted.map((deal) => (
          <DealCard key={deal.id} deal={deal} onClick={onSelectDeal} />
        ))}
      </div>

      <div className="table-wrap deals-table-desktop">
        <table className="deals-table">
          <thead>
            <tr>
              {columns.map((col) => (
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
            {rowEntries.map((entry) =>
              entry.kind === 'group'
                ? renderGroupRows(entry.key, entry.sides)
                : renderDataRow(entry.deal),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
