import type { AppRoute, Category, DealWithUrgency } from '../../types';
import { CATEGORIES, CATEGORY_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { TeamFilterHiddenBanner } from './TeamFilterHiddenBanner';
import { computeUrgency, sortByAttentionWithinCategory } from '../../utils/urgency';
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

  // Stage filter first (active deals only) — used for filter-hidden count
  const activeDeals = deals.filter((d) => d.stage !== 'closed');

  // Then apply team filter
  const filtered = activeDeals.filter(
    (d) =>
      preferences.activeTeamFilter === 'All' ||
      d.assignedTo === preferences.activeTeamFilter,
  );

  const hiddenByTeamFilter = activeDeals.length - filtered.length;

  const withUrgency = filtered.map((d) => computeUrgency(d));

  // Compute insights once for the whole filtered set
  const withInsight: DealWithInsight[] = withUrgency.map((d) => ({
    ...d,
    insight: computeInsight(d),
  }));

  // Today-worthy filter — strict cadence + late-stage exceptions only.
  // Never-contacted deals are excluded here (surfaced via banner instead) to
  // keep Today focused on cadence-driven follow-ups.
  const todayWorthy = withInsight.filter(
    (d) =>
      (d.followUpStatus === 'needs_attention' && !d.neverContacted) ||
      d.stage === 'under_contract' ||
      d.stage === 'closing',
  );

  const neverContactedCount = withUrgency.filter((d) => d.neverContacted).length;

  // Briefing draws from the same Today-worthy set, ranked by insight priority.
  const briefing = sortByInsightPriority(todayWorthy).slice(0, BRIEFING_MAX);

  // Group today-worthy by category, sort within
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
  // Needs Attention count excludes never-contacted to mirror what the section shows.
  const counts = {
    hot: withUrgency.filter((d) => d.category === 'hot').length,
    nurture: withUrgency.filter((d) => d.category === 'nurture').length,
    watch: withUrgency.filter((d) => d.category === 'watch').length,
    needsAttention: withUrgency.filter(
      (d) => d.followUpStatus === 'needs_attention' && !d.neverContacted,
    ).length,
  };

  const hasAny = withUrgency.length > 0;
  const hasTodayWorthy = todayWorthy.length > 0;
  const populatedCategories = CATEGORIES.filter((cat) => grouped[cat].length > 0);

  // Card-clickability: enabled iff a corresponding section will render on Today.
  const canClick = {
    hot: grouped.hot.length > 0,
    nurture: grouped.nurture.length > 0,
    watch: grouped.watch.length > 0,
    needsAttention: todayWorthy.some(
      (d) => d.followUpStatus === 'needs_attention' && !d.neverContacted,
    ),
  };

  // Needs Attention click target: first today-section containing a needs_attention deal.
  function findNeedsAttentionTarget(): string | null {
    for (const cat of CATEGORIES) {
      if (
        grouped[cat].some(
          (d) => d.followUpStatus === 'needs_attention' && !d.neverContacted,
        )
      ) {
        return sectionId(cat);
      }
    }
    return null;
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
          onClick={() => scrollToSection(sectionId('hot'))}
        >
          <span className="today-summary-count">{counts.hot}</span>
          <span className="today-summary-label">Hot</span>
        </button>
        <button
          type="button"
          className="today-summary-card today-summary-card--nurture"
          disabled={!canClick.nurture}
          onClick={() => scrollToSection(sectionId('nurture'))}
        >
          <span className="today-summary-count">{counts.nurture}</span>
          <span className="today-summary-label">Nurture</span>
        </button>
        <button
          type="button"
          className="today-summary-card today-summary-card--watch"
          disabled={!canClick.watch}
          onClick={() => scrollToSection(sectionId('watch'))}
        >
          <span className="today-summary-count">{counts.watch}</span>
          <span className="today-summary-label">Watch</span>
        </button>
        <button
          type="button"
          className="today-summary-card today-summary-card--attention"
          disabled={!canClick.needsAttention}
          onClick={() => scrollToSection(findNeedsAttentionTarget())}
        >
          <span className="today-summary-count">{counts.needsAttention}</span>
          <span className="today-summary-label">Needs Attention</span>
        </button>
      </div>

      {neverContactedCount > 0 && (
        <div className="never-contacted-banner" role="status">
          <span className="never-contacted-banner-text">
            {neverContactedCount === 1
              ? '1 client has no contact history logged.'
              : `${neverContactedCount} clients have no contact history logged.`}
          </span>
          <button
            type="button"
            className="never-contacted-banner-link"
            onClick={() => navigate('#/pipeline')}
          >
            Open in Pipeline →
          </button>
        </div>
      )}

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
