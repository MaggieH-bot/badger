import { useState } from 'react';
import type { AppRoute, Category, DealWithUrgency } from '../../types';
import { CATEGORIES, CATEGORY_LABELS, OPPORTUNITY_TYPE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { TeamFilterHiddenBanner } from './TeamFilterHiddenBanner';
import {
  computeUrgency,
  isUnattended,
  sortByAttentionWithinCategory,
} from '../../utils/urgency';
import {
  computeInsight,
  sortByInsightPriority,
  CALM_BRIEFING_MESSAGE,
  type DealWithInsight,
} from '../../utils/insights';
import { DealCard } from '../deals/DealCard';
import { InsightPanel } from '../intelligence/InsightPanel';

interface TodayViewProps {
  onSelectDeal: (dealId: string) => void;
  navigate: (to: AppRoute) => void;
}

const BRIEFING_MAX = 5;
const FIRST_TOUCH_PREVIEW = 5;
// Never-contacted clients older than this start showing up in Badger Says
// alongside cadence-driven follow-ups.
const STALE_NEVER_CONTACTED_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TodayFilter = 'hot' | 'nurture' | 'watch' | 'needs_attention';

const FILTER_LABELS: Record<TodayFilter, string> = {
  hot: 'Hot',
  nurture: 'Nurture',
  watch: 'Watch',
  needs_attention: 'Needs Attention',
};

export function TodayView({ onSelectDeal, navigate }: TodayViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();

  // Persistent summary-card filter. Toggling the same card off clears it.
  const [activeFilter, setActiveFilter] = useState<TodayFilter | null>(null);

  // Stage filter first (active deals only) — used for filter-hidden count.
  const activeDeals = deals.filter((d) => d.stage !== 'closed');

  // Then apply team filter.
  const filtered = activeDeals.filter(
    (d) =>
      preferences.activeTeamFilter === 'All' ||
      d.assignedTo === preferences.activeTeamFilter,
  );

  const hiddenByTeamFilter = activeDeals.length - filtered.length;

  const withUrgency = filtered.map((d) => computeUrgency(d));

  // Compute insights once for the whole filtered set.
  const withInsight: DealWithInsight[] = withUrgency.map((d) => ({
    ...d,
    insight: computeInsight(d),
  }));

  // Today-worthy: cadence-driven attention + Under Contract always surfaces.
  const todayWorthy = withInsight.filter(
    (d) =>
      (d.followUpStatus === 'needs_attention' && !d.neverContacted) ||
      d.stage === 'under_contract',
  );

  // First Touch list — sorted oldest-on-file first.
  const neverContacted = withInsight
    .filter((d) => d.neverContacted)
    .slice()
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  const firstTouchPreview = neverContacted.slice(0, FIRST_TOUCH_PREVIEW);

  // Stale never-contacted (on file for a week+) graduate into the briefing pool.
  const [nowMs] = useState(() => Date.now());
  const staleNeverContacted = neverContacted.filter(
    (d) =>
      (nowMs - new Date(d.createdAt).getTime()) / MS_PER_DAY >=
      STALE_NEVER_CONTACTED_DAYS,
  );

  const briefingPool: DealWithInsight[] = [...todayWorthy, ...staleNeverContacted];
  const briefing = sortByInsightPriority(briefingPool).slice(0, BRIEFING_MAX);

  // Group today-worthy by category, sort within (used in the unfiltered layout).
  const grouped: Record<Category, DealWithUrgency[]> = {
    hot: [],
    nurture: [],
    watch: [],
  };
  for (const d of todayWorthy) {
    grouped[d.category].push(d);
  }
  for (const cat of CATEGORIES) {
    grouped[cat] = sortByAttentionWithinCategory(grouped[cat]);
  }

  // Summary counts. Each card's count must equal the number of records shown
  // when that filter is active.
  const counts = {
    hot: withUrgency.filter((d) => d.category === 'hot').length,
    nurture: withUrgency.filter((d) => d.category === 'nurture').length,
    watch: withUrgency.filter((d) => d.category === 'watch').length,
    needsAttention: withUrgency.filter((d) => isUnattended(d)).length,
  };

  const hasAny = withUrgency.length > 0;
  const hasTodayWorthy = todayWorthy.length > 0;
  const populatedCategories = CATEGORIES.filter((cat) => grouped[cat].length > 0);

  // Card-clickability: enabled iff non-zero count.
  const canClick = {
    hot: counts.hot > 0,
    nurture: counts.nurture > 0,
    watch: counts.watch > 0,
    needsAttention: counts.needsAttention > 0,
  };

  // Click handler: toggle the card on/off (clicking the active card clears).
  function handleCardClick(filter: TodayFilter) {
    setActiveFilter((prev) => (prev === filter ? null : filter));
  }

  // The records shown when a filter is active. Sort by needs_attention first,
  // then days-since-contact desc, so the most urgent rise to the top.
  function buildFilteredList(): DealWithUrgency[] {
    if (activeFilter === 'needs_attention') {
      return sortByAttentionWithinCategory(
        withUrgency.filter((d) => isUnattended(d)),
      );
    }
    if (activeFilter === 'hot' || activeFilter === 'nurture' || activeFilter === 'watch') {
      return sortByAttentionWithinCategory(
        withUrgency.filter((d) => d.category === activeFilter),
      );
    }
    return [];
  }
  const filteredList = activeFilter ? buildFilteredList() : [];

  return (
    <div className="view">
      <h2>Today</h2>

      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope="active" />

      <div className="today-summary">
        <button
          type="button"
          className={`today-summary-card today-summary-card--hot${
            activeFilter === 'hot' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'hot'}
          disabled={!canClick.hot}
          onClick={() => handleCardClick('hot')}
        >
          <span className="today-summary-count">{counts.hot}</span>
          <span className="today-summary-label">Hot</span>
        </button>
        <button
          type="button"
          className={`today-summary-card today-summary-card--nurture${
            activeFilter === 'nurture' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'nurture'}
          disabled={!canClick.nurture}
          onClick={() => handleCardClick('nurture')}
        >
          <span className="today-summary-count">{counts.nurture}</span>
          <span className="today-summary-label">Nurture</span>
        </button>
        <button
          type="button"
          className={`today-summary-card today-summary-card--watch${
            activeFilter === 'watch' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'watch'}
          disabled={!canClick.watch}
          onClick={() => handleCardClick('watch')}
        >
          <span className="today-summary-count">{counts.watch}</span>
          <span className="today-summary-label">Watch</span>
        </button>
        <button
          type="button"
          className={`today-summary-card today-summary-card--attention${
            activeFilter === 'needs_attention' ? ' today-summary-card--active' : ''
          }`}
          aria-pressed={activeFilter === 'needs_attention'}
          disabled={!canClick.needsAttention}
          onClick={() => handleCardClick('needs_attention')}
        >
          <span className="today-summary-count">{counts.needsAttention}</span>
          <span className="today-summary-label">Needs Attention</span>
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
      ) : (
        <>
          {hasAny && (
            <section className="priority-briefing">
              <h3 className="priority-briefing-title">Badger Says</h3>
              {briefing.length === 0 ? (
                <p className="priority-briefing-calm">{CALM_BRIEFING_MESSAGE}</p>
              ) : (
                <div className="priority-briefing-list">
                  {briefing.map((d) => (
                    <InsightPanel
                      key={d.id}
                      insight={d.insight}
                      dealName={d.clientName}
                      onClick={() => onSelectDeal(d.id)}
                      variant="full"
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {neverContacted.length > 0 && (
            <section
              id="first-touch-section"
              className="first-touch-section"
              aria-label="First Touch"
            >
              <div className="first-touch-header">
                <h3 className="first-touch-title">
                  First Touch{' '}
                  <span className="first-touch-count">({neverContacted.length})</span>
                </h3>
                <p className="first-touch-caption">
                  Clients on file but never contacted. Use <strong>Log Activity</strong>{' '}
                  in the drawer to record a touch — that removes them from this list.
                </p>
              </div>
              <div className="first-touch-list">
                {firstTouchPreview.map((deal) => (
                  <button
                    key={deal.id}
                    type="button"
                    className={`first-touch-row first-touch-row--${deal.category}`}
                    onClick={() => onSelectDeal(deal.id)}
                  >
                    <span className="first-touch-name">{deal.clientName}</span>
                    <span className={`category-badge category-badge--${deal.category}`}>
                      {CATEGORY_LABELS[deal.category]}
                    </span>
                    {deal.opportunityType && (
                      <span className="first-touch-type">
                        {OPPORTUNITY_TYPE_LABELS[deal.opportunityType]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {neverContacted.length > firstTouchPreview.length && (
                <button
                  type="button"
                  className="first-touch-overflow"
                  onClick={() => navigate('#/pipeline')}
                >
                  View all {neverContacted.length} →
                </button>
              )}
            </section>
          )}

          {!hasAny ? (
            <div className="empty-state">
              <p>No active clients.</p>
              <p>Click "+ Add Client" to create your first client.</p>
            </div>
          ) : hasTodayWorthy ? (
            <div className="today-sections">
              {populatedCategories.map((cat) => (
                <section key={cat} className="today-section">
                  <div className={`today-section-header today-section-header--${cat}`}>
                    <h3>{CATEGORY_LABELS[cat]}</h3>
                    <span className="today-section-count">{grouped[cat].length}</span>
                  </div>
                  <div className="today-section-cards">
                    {grouped[cat].map((deal) => (
                      <DealCard key={deal.id} deal={deal} onClick={onSelectDeal} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
