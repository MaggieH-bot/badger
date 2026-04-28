import { useState } from 'react';
import type { AppRoute, DealWithUrgency } from '../../types';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { TeamFilterHiddenBanner } from './TeamFilterHiddenBanner';
import {
  computeUrgency,
  todayBucket,
  type TodayBucket,
} from '../../utils/urgency';
import { DealCard } from '../deals/DealCard';

interface TodayViewProps {
  onSelectDeal: (dealId: string) => void;
  // navigate is unused now that the First Touch overflow link is gone, but
  // App.tsx still passes it. Keeping the prop avoids touching unrelated code.
  navigate: (to: AppRoute) => void;
}

// Filter handles: clicking a card toggles the corresponding filter on/off.
// 'all_action' shows the union of the three buckets in a flat ordered list;
// the bucket-specific filters scope to one bucket only.
type TodayFilter = 'all_action' | TodayBucket;

const FILTER_LABELS: Record<TodayFilter, string> = {
  all_action: 'Needs Action',
  overdue: 'Overdue',
  due_today: 'Due Today',
  needs_next_step: 'Needs Next Step',
};

const SECTION_TITLES: Record<TodayBucket, string> = {
  overdue: 'Overdue',
  due_today: 'Due Today',
  needs_next_step: 'Needs Next Step',
};

const SECTION_HELP: Record<TodayBucket, string> = {
  overdue: 'Next Step Due Date is in the past.',
  due_today: 'Next Step Due Date falls today.',
  needs_next_step: 'No Next Step or Due Date set yet.',
};

const SECTION_ORDER: TodayBucket[] = ['overdue', 'due_today', 'needs_next_step'];

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

export function TodayView({ onSelectDeal }: TodayViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();

  // Persistent summary-card filter. Clicking the active card again clears it.
  const [activeFilter, setActiveFilter] = useState<TodayFilter | null>(null);

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
  // Needs Next Step. Any deal not matching one of these three is not part of
  // the action queue and is omitted from Today.
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

  // Card counts. Needs Action is the union of the three buckets — since the
  // buckets are mutually exclusive, this is a plain sum.
  const counts = {
    overdue: buckets.overdue.length,
    due_today: buckets.due_today.length,
    needs_next_step: buckets.needs_next_step.length,
    all_action:
      buckets.overdue.length +
      buckets.due_today.length +
      buckets.needs_next_step.length,
  };

  // Card clickability: enabled iff non-zero count.
  const canClick = {
    overdue: counts.overdue > 0,
    due_today: counts.due_today > 0,
    needs_next_step: counts.needs_next_step > 0,
    all_action: counts.all_action > 0,
  };

  function handleCardClick(filter: TodayFilter) {
    setActiveFilter((prev) => (prev === filter ? null : filter));
  }

  // Flat list rendered when activeFilter is set. For 'all_action', concatenate
  // the three buckets in precedence order so the most urgent surface first.
  function buildFilteredList(): DealWithUrgency[] {
    if (activeFilter === 'all_action') {
      return [...buckets.overdue, ...buckets.due_today, ...buckets.needs_next_step];
    }
    if (activeFilter) {
      return buckets[activeFilter];
    }
    return [];
  }

  const filteredList = activeFilter ? buildFilteredList() : [];
  const hasAny = withUrgency.length > 0;
  const populatedSections = SECTION_ORDER.filter((k) => buckets[k].length > 0);

  return (
    <div className="view">
      <h2>Today</h2>

      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope="active" />

      <div className="today-summary">
        <button
          type="button"
          className={`today-summary-card today-summary-card--attention${
            activeFilter === 'all_action' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'all_action'}
          disabled={!canClick.all_action}
          onClick={() => handleCardClick('all_action')}
        >
          <span className="today-summary-count">{counts.all_action}</span>
          <span className="today-summary-label">Needs Action</span>
        </button>
        <button
          type="button"
          className={`today-summary-card today-summary-card--hot${
            activeFilter === 'overdue' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'overdue'}
          disabled={!canClick.overdue}
          onClick={() => handleCardClick('overdue')}
        >
          <span className="today-summary-count">{counts.overdue}</span>
          <span className="today-summary-label">Overdue</span>
        </button>
        <button
          type="button"
          className={`today-summary-card today-summary-card--nurture${
            activeFilter === 'due_today' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'due_today'}
          disabled={!canClick.due_today}
          onClick={() => handleCardClick('due_today')}
        >
          <span className="today-summary-count">{counts.due_today}</span>
          <span className="today-summary-label">Due Today</span>
        </button>
        <button
          type="button"
          className={`today-summary-card today-summary-card--watch${
            activeFilter === 'needs_next_step' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'needs_next_step'}
          disabled={!canClick.needs_next_step}
          onClick={() => handleCardClick('needs_next_step')}
        >
          <span className="today-summary-count">{counts.needs_next_step}</span>
          <span className="today-summary-label">Needs Next Step</span>
        </button>
      </div>

      {activeFilter ? (
        <>
          <div className="today-filter-bar">
            <span className="today-filter-summary">
              Showing <strong>{filteredList.length}</strong>{' '}
              {filteredList.length === 1 ? 'client' : 'clients'} —{' '}
              {FILTER_LABELS[activeFilter]}
            </span>
            <button
              type="button"
              className="today-filter-clear"
              onClick={() => setActiveFilter(null)}
            >
              Show All
            </button>
          </div>
          {filteredList.length === 0 ? (
            <div className="empty-state">
              <p>No clients match this filter.</p>
            </div>
          ) : (
            <div className="today-section-cards">
              {filteredList.map((deal) => (
                <DealCard key={deal.id} deal={deal} onClick={onSelectDeal} />
              ))}
            </div>
          )}
        </>
      ) : !hasAny ? (
        <div className="empty-state">
          <p>No active clients.</p>
          <p>Click "+ Add Client" to create your first client.</p>
        </div>
      ) : counts.all_action === 0 ? (
        <div className="empty-state">
          <p>Nothing needs action today.</p>
          <p>Every active client has a Next Step and Due Date in the future.</p>
        </div>
      ) : (
        <div className="today-sections">
          {populatedSections.map((key) => (
            <section key={key} className="today-section">
              <div className={`today-section-header today-section-header--${key}`}>
                <h3>{SECTION_TITLES[key]}</h3>
                <span className="today-section-count">{buckets[key].length}</span>
              </div>
              <p className="today-section-help">{SECTION_HELP[key]}</p>
              <div className="today-section-cards">
                {buckets[key].map((deal) => (
                  <DealCard key={deal.id} deal={deal} onClick={onSelectDeal} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
