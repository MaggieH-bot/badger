import { useState, useRef } from 'react';
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
  // navigate is unused now but App.tsx still passes it. Keeping the prop
  // avoids touching unrelated code.
  navigate: (to: AppRoute) => void;
}

const SECTION_ORDER: TodayBucket[] = ['overdue', 'due_today', 'needs_next_step'];

const SECTION_TITLES: Record<TodayBucket, string> = {
  overdue: 'Overdue',
  due_today: 'Due Today',
  needs_next_step: 'Needs Next Step',
};

const CARD_CAPTIONS: Record<TodayBucket, string> = {
  overdue: 'Next Step Due Date is in the past',
  due_today: 'Next Step Due Date is today',
  needs_next_step: 'Missing Next Step or Due Date',
};

const CARD_ICONS: Record<TodayBucket, string> = {
  overdue: '⏰',
  due_today: '📅',
  needs_next_step: '📋',
};

const ACTION_LABELS: Record<TodayBucket, string> = {
  overdue: 'OVERDUE',
  due_today: 'DUE TODAY',
  needs_next_step: 'NEEDS NEXT STEP',
};

const PREVIEW_COUNT = 5;

// Within a section, sort by next-step due (earliest first), then by client
// name. needs_next_step has no due date, so we fall through to name.
function sortBucket(deals: DealWithUrgency[]): DealWithUrgency[] {
  return [...deals].sort((a, b) => {
    const ad = a.nextStepDue ?? '';
    const bd = b.nextStepDue ?? '';
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return a.clientName.localeCompare(b.clientName);
  });
}

function formatDueShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function lastContactText(deal: DealWithUrgency): string {
  if (deal.neverContacted) return 'Never contacted';
  if (deal.daysSinceContact === 0) return 'today';
  if (deal.daysSinceContact === 1) return '1 day ago';
  return `${deal.daysSinceContact} days ago`;
}

interface DueLabel {
  text: string;
  tone: 'overdue' | 'due_today' | 'muted';
}

function dueLabelFor(deal: DealWithUrgency, bucket: TodayBucket): DueLabel {
  if (bucket === 'needs_next_step') {
    return { text: 'Missing Next Step and Due Date', tone: 'muted' };
  }
  if (!deal.nextStepDue) {
    return { text: '—', tone: 'muted' };
  }
  const formatted = formatDueShort(deal.nextStepDue);
  if (bucket === 'overdue') {
    return { text: `${formatted} (Past Due)`, tone: 'overdue' };
  }
  return { text: `${formatted} (Today)`, tone: 'due_today' };
}

export function TodayView({ onSelectDeal }: TodayViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const sectionRefs = useRef<Record<TodayBucket, HTMLElement | null>>({
    overdue: null,
    due_today: null,
    needs_next_step: null,
  });

  // Per-section "expanded" toggle. Sections show a 5-row preview by default;
  // expanding reveals the rest.
  const [expanded, setExpanded] = useState<Record<TodayBucket, boolean>>({
    overdue: false,
    due_today: false,
    needs_next_step: false,
  });

  // Active deals only; closed records are excluded from Today entirely.
  const activeDeals = deals.filter((d) => d.stage !== 'closed');

  // Then apply team filter for the count surfaced in the banner.
  const filtered = activeDeals.filter(
    (d) =>
      preferences.activeTeamFilter === 'All' ||
      d.assignedTo === preferences.activeTeamFilter,
  );

  const hiddenByTeamFilter = activeDeals.length - filtered.length;
  const withUrgency = filtered.map((d) => computeUrgency(d));

  // Bucketize once. Mutually exclusive precedence: Overdue → Due Today →
  // Needs Next Step. Any deal not matching one of these three is omitted.
  const buckets: Record<TodayBucket, DealWithUrgency[]> = {
    overdue: [],
    due_today: [],
    needs_next_step: [],
  };
  for (const d of withUrgency) {
    const key = todayBucket(d);
    if (key) buckets[key].push(d);
  }
  for (const key of SECTION_ORDER) {
    buckets[key] = sortBucket(buckets[key]);
  }

  const counts: Record<TodayBucket, number> = {
    overdue: buckets.overdue.length,
    due_today: buckets.due_today.length,
    needs_next_step: buckets.needs_next_step.length,
  };
  const totalNeedsAction =
    counts.overdue + counts.due_today + counts.needs_next_step;

  function jumpToSection(key: TodayBucket) {
    const el = sectionRefs.current[key];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function expandSection(key: TodayBucket) {
    setExpanded((prev) => ({ ...prev, [key]: true }));
  }

  const hasAny = withUrgency.length > 0;
  const populatedSections = SECTION_ORDER.filter((k) => buckets[k].length > 0);

  return (
    <div className="view today-view">
      <header className="today-header">
        <h2>Today</h2>
        <p className="today-header-summary">
          <strong className="today-header-count">{totalNeedsAction}</strong>{' '}
          {totalNeedsAction === 1 ? 'client needs action' : 'clients need action'}
        </p>
      </header>

      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope="active" />

      <div className="today-summary today-summary--three">
        {SECTION_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className={`today-card today-card--${key}`}
            disabled={counts[key] === 0}
            onClick={() => jumpToSection(key)}
            aria-label={`${SECTION_TITLES[key]} — ${counts[key]} ${
              counts[key] === 1 ? 'client' : 'clients'
            }`}
          >
            <span className="today-card-icon" aria-hidden="true">
              {CARD_ICONS[key]}
            </span>
            <span className="today-card-body">
              <span className="today-card-count">{counts[key]}</span>
              <span className="today-card-label">{SECTION_TITLES[key]}</span>
              <span className="today-card-caption">{CARD_CAPTIONS[key]}</span>
            </span>
            <span className="today-card-chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>

      {!hasAny ? (
        <div className="empty-state">
          <p>No active clients.</p>
          <p>Click "+ Add Client" to create your first client.</p>
        </div>
      ) : totalNeedsAction === 0 ? (
        <div className="empty-state">
          <p>Nothing needs action today.</p>
          <p>Every active client has a Next Step and Due Date in the future.</p>
        </div>
      ) : (
        <div className="today-sections">
          {populatedSections.map((key) => {
            const rows = buckets[key];
            const isExpanded = expanded[key];
            const visible = isExpanded ? rows : rows.slice(0, PREVIEW_COUNT);
            const overflow = rows.length - visible.length;
            return (
              <section
                key={key}
                ref={(el) => {
                  sectionRefs.current[key] = el;
                }}
                className={`today-section today-section--${key}`}
              >
                <div className="today-section-row">
                  <div className="today-section-heading">
                    <span className="today-section-icon" aria-hidden="true">
                      {CARD_ICONS[key]}
                    </span>
                    <h3 className="today-section-title">{SECTION_TITLES[key]}</h3>
                    <span className="today-section-count">{rows.length}</span>
                  </div>
                  {!isExpanded && overflow > 0 && (
                    <button
                      type="button"
                      className="today-section-viewall"
                      onClick={() => expandSection(key)}
                    >
                      View all
                    </button>
                  )}
                </div>

                <div className="today-table-wrap">
                  <table className="today-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Type</th>
                        <th>Stage</th>
                        <th>Category</th>
                        <th>Assigned To</th>
                        <th>Last Contact</th>
                        <th>Next Step / Due Date</th>
                        <th className="today-table-action-col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((deal) => {
                        const due = dueLabelFor(deal, key);
                        return (
                          <tr
                            key={deal.id}
                            className="today-table-row"
                            onClick={() => onSelectDeal(deal.id)}
                          >
                            <td className="today-table-td--name">
                              {deal.clientName}
                            </td>
                            <td>
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
                            <td>{STAGE_LABELS[deal.stage]}</td>
                            <td>
                              <span
                                className={`category-badge category-badge--${deal.category}`}
                              >
                                {CATEGORY_LABELS[deal.category]}
                              </span>
                            </td>
                            <td>{displayAssignee(deal.assignedTo, members)}</td>
                            <td>{lastContactText(deal)}</td>
                            <td className="today-table-td--nextstep">
                              <div className="today-nextstep-text">
                                {deal.nextStep?.trim() || '—'}
                              </div>
                              <div
                                className={`today-due-label today-due-label--${due.tone}`}
                              >
                                {due.text}
                              </div>
                            </td>
                            <td className="today-table-action-col">
                              <span
                                className={`today-action-badge today-action-badge--${key}`}
                              >
                                {ACTION_LABELS[key]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!isExpanded && overflow > 0 && (
                  <button
                    type="button"
                    className="today-section-showmore"
                    onClick={() => expandSection(key)}
                  >
                    + Show {overflow} more
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      <aside className="today-info-banner" role="note">
        <span className="today-info-icon" aria-hidden="true">ⓘ</span>
        <span>
          Clients are shown here based on <strong>Next Step</strong> and{' '}
          <strong>Due Date</strong> only. Closed transactions are not included.
        </span>
      </aside>
    </div>
  );
}
