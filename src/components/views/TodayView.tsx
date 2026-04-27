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
// alongside cadence-driven follow-ups. Pressure to clean up grows over time
// instead of staying buried in the First Touch list forever.
const STALE_NEVER_CONTACTED_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function sectionId(cat: Category): string {
  return `today-section-${cat}`;
}

function scrollToSection(id: string | null) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function TodayView({ onSelectDeal, navigate }: TodayViewProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();

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

  // Today-worthy: cadence-driven attention + Under Contract always surfaces
  // (per locked rule — Stage = workflow sensitivity, not a cadence override).
  // Never-contacted clients are surfaced via the dedicated First Touch section
  // and only enter Badger Says if they've been on file for STALE_NEVER_CONTACTED_DAYS+.
  const todayWorthy = withInsight.filter(
    (d) =>
      (d.followUpStatus === 'needs_attention' && !d.neverContacted) ||
      d.stage === 'under_contract',
  );

  // First Touch list — sorted oldest-on-file first to put cleanup pressure on
  // the records that have languished longest.
  const neverContacted = withInsight
    .filter((d) => d.neverContacted)
    .slice()
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  const firstTouchPreview = neverContacted.slice(0, FIRST_TOUCH_PREVIEW);

  // Stale never-contacted (on file for a week+) graduate into the Badger Says
  // briefing pool — they're a real risk now, not just data hygiene.
  // useState init runs once per mount; satisfies react-hooks/purity (no
  // direct Date.now() call in the render body).
  const [nowMs] = useState(() => Date.now());
  const staleNeverContacted = neverContacted.filter(
    (d) =>
      (nowMs - new Date(d.createdAt).getTime()) / MS_PER_DAY >=
      STALE_NEVER_CONTACTED_DAYS,
  );

  const briefingPool: DealWithInsight[] = [...todayWorthy, ...staleNeverContacted];
  const briefing = sortByInsightPriority(briefingPool).slice(0, BRIEFING_MAX);

  // Group today-worthy by category, sort within.
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

  // Summary counts use ALL active filtered deals (unchanged for category totals).
  // Needs Attention is the total unattended workload — never-contacted clients,
  // cadence-overdue clients, overdue Next Step Due, Under Contract without a
  // Next Step or with a blocker. Centralized via the isUnattended predicate so
  // the count and the click target use the same definition.
  const counts = {
    hot: withUrgency.filter((d) => d.category === 'hot').length,
    nurture: withUrgency.filter((d) => d.category === 'nurture').length,
    watch: withUrgency.filter((d) => d.category === 'watch').length,
    needsAttention: withUrgency.filter((d) => isUnattended(d)).length,
  };

  const hasAny = withUrgency.length > 0;
  const hasTodayWorthy = todayWorthy.length > 0;
  const populatedCategories = CATEGORIES.filter((cat) => grouped[cat].length > 0);

  // A summary card is enabled whenever it has a non-zero count. The click
  // handler routes to the best available target so the card never looks
  // clickable without doing something useful.
  const canClick = {
    hot: counts.hot > 0,
    nurture: counts.nurture > 0,
    watch: counts.watch > 0,
    // counts.needsAttention already includes First Touch via isUnattended.
    needsAttention: counts.needsAttention > 0,
  };

  function scrollToFirstTouch() {
    const el = document.getElementById('first-touch-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleCategoryClick(cat: Category) {
    // 1. Today has a section for this category → scroll to it.
    if (grouped[cat].length > 0) {
      scrollToSection(sectionId(cat));
      return;
    }
    // 2. The First Touch backlog has a client of this category → scroll there.
    if (neverContacted.some((d) => d.category === cat)) {
      scrollToFirstTouch();
      return;
    }
    // 3. Fall back to Pipeline.
    navigate('#/pipeline');
  }

  function handleNeedsAttentionClick() {
    // 1. Prefer a Today section that already contains an unattended (and
    //    contacted) client — never-contacted lives in First Touch, so we
    //    skip them in this lookup.
    for (const cat of CATEGORIES) {
      if (grouped[cat].some((d) => !d.neverContacted && isUnattended(d))) {
        scrollToSection(sectionId(cat));
        return;
      }
    }
    // 2. Otherwise, the First Touch backlog IS the unattended work — go there.
    if (neverContacted.length > 0) {
      scrollToFirstTouch();
      return;
    }
    // 3. Fall back to Pipeline.
    navigate('#/pipeline');
  }

  return (
    <div className="view">
      <h2>Today</h2>

      <TeamFilterHiddenBanner hiddenCount={hiddenByTeamFilter} scope="active" />

      <div className="today-summary">
        <button
          type="button"
          className="today-summary-card today-summary-card--hot"
          disabled={!canClick.hot}
          onClick={() => handleCategoryClick('hot')}
        >
          <span className="today-summary-count">{counts.hot}</span>
          <span className="today-summary-label">Hot</span>
        </button>
        <button
          type="button"
          className="today-summary-card today-summary-card--nurture"
          disabled={!canClick.nurture}
          onClick={() => handleCategoryClick('nurture')}
        >
          <span className="today-summary-count">{counts.nurture}</span>
          <span className="today-summary-label">Nurture</span>
        </button>
        <button
          type="button"
          className="today-summary-card today-summary-card--watch"
          disabled={!canClick.watch}
          onClick={() => handleCategoryClick('watch')}
        >
          <span className="today-summary-count">{counts.watch}</span>
          <span className="today-summary-label">Watch</span>
        </button>
        <button
          type="button"
          className="today-summary-card today-summary-card--attention"
          disabled={!canClick.needsAttention}
          onClick={handleNeedsAttentionClick}
        >
          <span className="today-summary-count">{counts.needsAttention}</span>
          <span className="today-summary-label">Needs Attention</span>
        </button>
      </div>

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
              First Touch <span className="first-touch-count">({neverContacted.length})</span>
            </h3>
            <p className="first-touch-caption">
              Clients on file but never contacted. Use <strong>Log Activity</strong> in the
              drawer to record a touch — that removes them from this list.
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
            <section key={cat} id={sectionId(cat)} className="today-section">
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
    </div>
  );
}
