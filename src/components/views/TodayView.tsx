import { useState } from 'react';
import type { AppRoute, DealWithUrgency } from '../../types';
import {
  STAGE_LABELS,
  CATEGORY_LABELS,
  OPPORTUNITY_TYPE_LABELS,
} from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { TeamFilterHiddenBanner } from './TeamFilterHiddenBanner';
import {
  computeUrgency,
  todayBucket,
  type TodayBucket,
} from '../../utils/urgency';
import { displayAssignee } from '../../utils/assignee';

interface TodayViewProps {
  onSelectDeal: (dealId: string) => void;
  // navigate is unused here but App.tsx still passes it.
  navigate: (to: AppRoute) => void;
}

type TodayChip = 'all' | TodayBucket;

const REASON_LABELS: Record<TodayBucket, string> = {
  overdue: 'OVERDUE',
  due_today: 'DUE TODAY',
  needs_next_step: 'NEEDS STEP',
};

const CHIP_LABELS: Record<TodayChip, string> = {
  all: 'All',
  overdue: 'Overdue',
  due_today: 'Due Today',
  needs_next_step: 'Needs Step',
};

// Bucket precedence drives both default sort and the order chips/buckets
// appear in. Closed records and anything not matching one of the three
// predicates is omitted from Today entirely.
const BUCKET_PRECEDENCE: Record<TodayBucket, number> = {
  overdue: 0,
  due_today: 1,
  needs_next_step: 2,
};

function pluralClient(n: number): string {
  return n === 1 ? 'client' : 'clients';
}

// Compose a short Badger Says briefing: a cheeky lead phrase sized to the
// total workload, then a comma-separated action priority. Pulls counts only;
// no new logic.
function badgerSaysMessage(c: {
  overdue: number;
  due_today: number;
  needs_next_step: number;
}): string {
  const total = c.overdue + c.due_today + c.needs_next_step;

  if (total === 0) {
    return 'All caught up. Nothing on fire today.';
  }

  // Cheeky lead, sized by total. Tuned so the user's reference 28-client case
  // ("Tiny chaos, manageable pile.") falls in the middle band.
  let lead: string;
  if (total === 1) lead = 'Just the one — easy.';
  else if (total <= 5) lead = 'Small pile, knock it out.';
  else if (total <= 30) lead = 'Tiny chaos, manageable pile.';
  else if (total <= 60) lead = 'Real workload — pace yourself.';
  else lead = 'Big day. Coffee up.';

  // Action priority: overdue → due today → needs step. Verbs are lowercase
  // by default; the first item gets capitalized after assembly.
  const parts: string[] = [];
  if (c.overdue > 0) {
    parts.push(`start with ${c.overdue} overdue ${pluralClient(c.overdue)}`);
  }
  if (c.due_today > 0) {
    parts.push(`handle ${c.due_today} due today`);
  }
  if (c.needs_next_step > 0) {
    parts.push(
      `give ${c.needs_next_step} ${pluralClient(c.needs_next_step)} a next step`,
    );
  }

  // Capitalize the first verb. Join with commas; insert "then " before the
  // final item when there are 2+ to read naturally.
  parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  let action: string;
  if (parts.length === 1) {
    action = parts[0];
  } else {
    const last = parts[parts.length - 1];
    const rest = parts.slice(0, -1);
    action = `${rest.join(', ')}, then ${last}`;
  }

  return `${lead} ${action}.`;
}

interface DueLabel {
  text: string;
  tone: 'overdue' | 'due_today' | 'muted';
}

function formatDueShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueLabelFor(deal: DealWithUrgency, bucket: TodayBucket): DueLabel {
  if (bucket === 'needs_next_step') {
    return { text: 'Missing Due Date', tone: 'muted' };
  }
  if (!deal.nextStepDue) {
    return { text: '—', tone: 'muted' };
  }
  const formatted = formatDueShort(deal.nextStepDue);
  if (bucket === 'overdue') {
    return { text: `${formatted} · Past Due`, tone: 'overdue' };
  }
  return { text: `${formatted} · Today`, tone: 'due_today' };
}

function lastContactText(deal: DealWithUrgency): string {
  if (deal.neverContacted) return 'Never contacted';
  if (deal.daysSinceContact === 0) return 'Last contact: today';
  if (deal.daysSinceContact === 1) return 'Last contact: 1 day ago';
  return `Last contact: ${deal.daysSinceContact} days ago`;
}

interface ActionRow extends DealWithUrgency {
  bucket: TodayBucket;
}

export function TodayView({ onSelectDeal }: TodayViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const [chip, setChip] = useState<TodayChip>('all');

  // Active deals only; closed records are excluded entirely.
  const activeDeals = deals.filter((d) => d.stage !== 'closed');

  const filtered = activeDeals.filter(
    (d) =>
      preferences.activeTeamFilter === 'All' ||
      d.assignedTo === preferences.activeTeamFilter,
  );
  const hiddenByTeamFilter = activeDeals.length - filtered.length;
  const withUrgency = filtered.map((d) => computeUrgency(d));

  // Bucketize → ActionRow array. Mutually exclusive precedence (Overdue →
  // Due Today → Needs Next Step) is enforced by todayBucket().
  const rows: ActionRow[] = [];
  for (const d of withUrgency) {
    const bucket = todayBucket(d);
    if (bucket) rows.push({ ...d, bucket });
  }

  // Default sort: bucket precedence, then due date asc, then client name. The
  // result is the same list whether the user is on All or has filtered to a
  // single bucket — filtering just hides rows.
  rows.sort((a, b) => {
    const bp = BUCKET_PRECEDENCE[a.bucket] - BUCKET_PRECEDENCE[b.bucket];
    if (bp !== 0) return bp;
    const ad = a.nextStepDue ?? '';
    const bd = b.nextStepDue ?? '';
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return a.clientName.localeCompare(b.clientName);
  });

  const counts: Record<TodayBucket, number> = {
    overdue: 0,
    due_today: 0,
    needs_next_step: 0,
  };
  for (const r of rows) counts[r.bucket] += 1;
  const total = rows.length;

  const visibleRows = chip === 'all' ? rows : rows.filter((r) => r.bucket === chip);

  const chipBadgeCount: Record<TodayChip, number> = {
    all: total,
    overdue: counts.overdue,
    due_today: counts.due_today,
    needs_next_step: counts.needs_next_step,
  };

  const briefing = badgerSaysMessage(counts);

  return (
    <div className="view today-view">
      <header className="today-header">
        <h2>Today</h2>
        <p className="today-header-summary">
          <strong className="today-header-count">{total}</strong>{' '}
          {pluralClient(total)} need{total === 1 ? 's' : ''} action
        </p>
      </header>

      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope="active" />

      <aside className="badger-says" role="note">
        <span className="badger-says-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 28 28">
            <rect
              x="2"
              y="2"
              width="24"
              height="24"
              rx="6"
              fill="var(--bg-elevated)"
              stroke="var(--accent)"
              strokeWidth="1.5"
            />
            <rect x="9" y="7" width="2.5" height="14" rx="1.25" fill="var(--accent)" />
            <rect x="16.5" y="7" width="2.5" height="14" rx="1.25" fill="var(--accent)" />
          </svg>
        </span>
        <div className="badger-says-body">
          <span className="badger-says-title">Badger Says</span>
          <span className="badger-says-text">{briefing}</span>
        </div>
      </aside>

      <div className="today-chips" role="tablist" aria-label="Filter by reason">
        {(['all', 'overdue', 'due_today', 'needs_next_step'] as TodayChip[]).map(
          (c) => {
            const active = c === chip;
            const count = chipBadgeCount[c];
            const disabled = c !== 'all' && count === 0;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                className={
                  'today-chip ' +
                  (c === 'all' ? 'today-chip--all' : `today-chip--${c}`) +
                  (active ? ' today-chip--active' : '')
                }
                onClick={() => setChip(c)}
              >
                <span className="today-chip-label">{CHIP_LABELS[c]}</span>
                <span className="today-chip-count">{count}</span>
              </button>
            );
          },
        )}
      </div>

      {total === 0 ? (
        <div className="empty-state">
          {withUrgency.length === 0 ? (
            <>
              <p>No active clients.</p>
              <p>Click "+ Add Client" to create your first client.</p>
            </>
          ) : (
            <>
              <p>Nothing needs action today.</p>
              <p>Every active client has a Next Step and Due Date in the future.</p>
            </>
          )}
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="empty-state">
          <p>No clients match this filter.</p>
        </div>
      ) : (
        <div className="today-list-wrap">
          <table className="today-list">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reason</th>
                <th>Next Step / Due Date</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const due = dueLabelFor(row, row.bucket);
                return (
                  <tr
                    key={row.id}
                    className="today-list-row"
                    onClick={() => onSelectDeal(row.id)}
                  >
                    <td className="today-list-td--name">{row.clientName}</td>
                    <td>
                      <span
                        className={`today-action-badge today-action-badge--${row.bucket}`}
                      >
                        {REASON_LABELS[row.bucket]}
                      </span>
                    </td>
                    <td className="today-list-td--nextstep">
                      <div className="today-nextstep-text">
                        {row.nextStep?.trim() || 'Missing Next Step'}
                      </div>
                      <div
                        className={`today-due-label today-due-label--${due.tone}`}
                      >
                        {due.text}
                      </div>
                    </td>
                    <td className="today-list-td--details">
                      <div className="today-details-line">
                        {row.opportunityType && (
                          <span>{OPPORTUNITY_TYPE_LABELS[row.opportunityType]}</span>
                        )}
                        <span className="today-details-sep">·</span>
                        <span>{STAGE_LABELS[row.stage]}</span>
                        <span className="today-details-sep">·</span>
                        <span className={`today-details-cat today-details-cat--${row.category}`}>
                          {CATEGORY_LABELS[row.category]}
                        </span>
                      </div>
                      <div className="today-details-line today-details-line--muted">
                        <span>{displayAssignee(row.assignedTo, members)}</span>
                        <span className="today-details-sep">·</span>
                        <span>{lastContactText(row)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
