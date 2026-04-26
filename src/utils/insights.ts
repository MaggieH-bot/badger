import type {
  Deal,
  DealWithUrgency,
  BadgerInsight,
  InsightPriority,
  OpportunityType,
} from '../types';
import { STAGE_LABELS, CATEGORY_LABELS } from '../constants/pipeline';

// ============================================
// Helpers (build copy from existing fields, never leak undefined)
// ============================================

function roleNoun(t: OpportunityType | undefined): string {
  switch (t) {
    case 'buy':
      return 'buyer';
    case 'sell':
      return 'seller';
    case 'rent':
      return 'rental client';
    case 'both':
      return 'client';
    default:
      return 'client';
  }
}

function areaPhrase(d: Deal): string {
  return d.areaOfInterest?.trim() || 'their target area';
}

function valueAddByType(d: Deal): string {
  switch (d.opportunityType) {
    case 'buy':
      return `Share a short inventory update for ${areaPhrase(d)}.`;
    case 'sell':
      return `Send recent comparable sales in ${areaPhrase(d)}.`;
    case 'rent':
      return `Share a rental market summary for ${areaPhrase(d)}.`;
    case 'both':
      return `Send market activity in ${areaPhrase(d)}.`;
    default:
      return `Share a relevant market update for ${areaPhrase(d)}.`;
  }
}

function touchByType(d: Deal): string {
  switch (d.opportunityType) {
    case 'buy':
      return 'Reach out with current listings or offer a tour plan.';
    case 'sell':
      return 'Check in on listing prep, staging, or pricing.';
    case 'rent':
      return 'Send fresh rental options.';
    case 'both':
      return 'Reach out about both buy- and sell-side activity.';
    default:
      return 'Reach out with a relevant update.';
  }
}

// Surface nextAction as the touch when present; otherwise fall back to type-based.
function smartTouch(d: Deal): string {
  const next = d.nextAction?.trim();
  if (next) return `Next up: ${next}`;
  return touchByType(d);
}

function daysPhrase(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function hasNextAction(d: Deal): boolean {
  return Boolean(d.nextAction?.trim());
}

function pricePhrase(d: Deal): string | null {
  if (d.price === undefined || d.price === null) return null;
  const p = d.price;
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p >= 1_000_000) {
    const m = p / 1_000_000;
    return `$${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (p >= 1_000) return `$${Math.round(p / 1_000)}K`;
  return `$${p}`;
}

function probabilityPhrase(d: Deal): string | null {
  return d.probability !== undefined ? `${d.probability}%` : null;
}

// Prepend a "$X — " price marker to a reason string when price is available.
function pricedReason(d: Deal, base: string): string {
  const pp = pricePhrase(d);
  return pp ? `${pp} — ${base}` : base;
}

// One muted line for at-a-glance recall. First match wins; callers can suppress
// sources already mentioned in the reason text.
type ContextSource = 'timeframe' | 'motivation' | 'leadSource';

function contextNoteOf(d: Deal, exclude: ContextSource[] = []): string | undefined {
  const tf = d.targetTimeframe?.trim();
  if (tf && !exclude.includes('timeframe')) return `Targeting ${tf}`;

  const m = d.motivation?.trim();
  if (m && !exclude.includes('motivation')) return `Motivation: ${m}`;

  const ls = d.leadSource?.trim();
  if (ls && !exclude.includes('leadSource')) {
    const refMatch = /^referral from\s+(.+)$/i.exec(ls);
    if (refMatch) return `Referred by ${refMatch[1].trim()}`;
    if (/^referral$/i.test(ls)) return 'Referral';
    return `Lead source: ${ls}`;
  }

  return undefined;
}

function isLateStage(d: Deal): boolean {
  return d.stage === 'closing' || d.stage === 'under_contract';
}

// ============================================
// Rules (first match wins, evaluated top-to-bottom)
// ============================================

const CLOSED_INSIGHT: BadgerInsight = {
  priority: 'low',
  reason: 'Deal closed.',
  suggestedTouch: '',
  suggestedValueAdd: '',
};

export function computeInsight(d: DealWithUrgency): BadgerInsight {
  // 1. Closed → no actionable insight (UI hides the panel)
  if (d.stage === 'closed') return CLOSED_INSIGHT;

  // 2. Never contacted → log first touch (beats blocker / category logic)
  if (d.neverContacted) {
    return {
      priority: 'high',
      reason: 'No contact has been logged for this deal yet.',
      suggestedTouch: 'Reach out and log your first touch.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 3. Late stage (closing / under_contract) + blocker → critical close-blocker
  //    Wins over the close-risk rule because the blocker IS the issue.
  if (isLateStage(d) && d.blocker?.trim()) {
    const stageLabel = STAGE_LABELS[d.stage];
    return {
      priority: 'high',
      reason: pricedReason(d, `${stageLabel} blocked: ${d.blocker.trim()}`),
      suggestedTouch:
        'Resolve the blocker with the client today — the close depends on it.',
      suggestedValueAdd:
        'Send a closing/escrow checklist with the open item highlighted.',
      contextNote: contextNoteOf(d),
    };
  }

  // 4. needs_attention + late stage → close-risk (price-aware)
  if (d.followUpStatus === 'needs_attention' && isLateStage(d)) {
    const base = `Deal in ${STAGE_LABELS[d.stage]} hasn't been touched in ${daysPhrase(d.daysSinceContact)} — risk to close.`;
    return {
      priority: 'high',
      reason: pricedReason(d, base),
      suggestedTouch: 'Confirm timeline and outstanding items today.',
      suggestedValueAdd: 'Send a closing/escrow checklist.',
      contextNote: contextNoteOf(d),
    };
  }

  // 5. Sell + under_contract (on track) → contract management
  if (
    d.stage === 'under_contract' &&
    (d.opportunityType === 'sell' || d.opportunityType === 'both')
  ) {
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Under contract — protect the timeline.'),
      suggestedTouch: smartTouch(d),
      suggestedValueAdd:
        'Confirm contingencies, inspection dates, and lender deadlines.',
      contextNote: contextNoteOf(d),
    };
  }

  // 6. Hot + blocker (any non-late stage) → unblock fast
  if (d.category === 'hot' && d.blocker?.trim()) {
    return {
      priority: 'high',
      reason: `Hot deal blocked: ${d.blocker.trim()}`,
      suggestedTouch: 'Tackle the blocker with the client directly.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 7. Buy + active + needs_attention → buyer momentum at risk
  if (
    d.stage === 'active' &&
    d.opportunityType === 'buy' &&
    d.followUpStatus === 'needs_attention'
  ) {
    return {
      priority: 'high',
      reason: `Active buyer cooled off — ${daysPhrase(d.daysSinceContact)} since last contact.`,
      suggestedTouch: `Send 2–3 fresh listings in ${areaPhrase(d)} and offer a tour window this week.`,
      suggestedValueAdd:
        'Re-confirm budget and must-haves before momentum stalls.',
      contextNote: contextNoteOf(d),
    };
  }

  // 8. Active sell/both listing — stage drives the copy, not category.
  if (
    d.stage === 'active' &&
    (d.opportunityType === 'sell' || d.opportunityType === 'both')
  ) {
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Active listing hasn't had a touch in ${daysPhrase(d.daysSinceContact)}.`,
        ),
        suggestedTouch:
          'Send showing feedback, market activity, and a recommendation.',
        suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextAction(d)) {
      return {
        priority: 'high',
        reason: pricedReason(d, 'Active listing has no defined next step.'),
        suggestedTouch: 'Set a recurring update cadence (weekly market touch).',
        suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Active listing — keep regular updates flowing.'),
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
      contextNote: contextNoteOf(d),
    };
  }

  // 9. Buy + lead → activate the buyer while interest is fresh
  if (d.stage === 'lead' && d.opportunityType === 'buy') {
    return {
      priority: 'medium',
      reason: 'New buyer lead — activate them while interest is fresh.',
      suggestedTouch:
        'Schedule a discovery call: budget, timeline, must-haves.',
      suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
      contextNote: contextNoteOf(d),
    };
  }

  // 10. Sell + lead → start prelisting prep
  if (
    d.stage === 'lead' &&
    (d.opportunityType === 'sell' || d.opportunityType === 'both')
  ) {
    return {
      priority: 'medium',
      reason: 'New seller lead — start prelisting prep.',
      suggestedTouch: 'Schedule a walkthrough and pricing conversation.',
      suggestedValueAdd: `Send recent comps in ${areaPhrase(d)} and a prelisting checklist.`,
      contextNote: contextNoteOf(d),
    };
  }

  // 11. Hot + no nextAction → high (also surfaces needs_attention in reason)
  if (d.category === 'hot' && !hasNextAction(d)) {
    const role = roleNoun(d.opportunityType);
    const conf = probabilityPhrase(d);
    const confSuffix = conf ? ` (${conf})` : '';
    const reason =
      d.followUpStatus === 'needs_attention'
        ? `Hot ${role}${confSuffix} hasn't been contacted in ${daysPhrase(d.daysSinceContact)} and has no defined next step.`
        : `Hot ${role}${confSuffix} has no defined next step.`;
    return {
      priority: 'high',
      reason,
      suggestedTouch: 'Set one concrete next step today, then reach out.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 12. Hot + needs_attention (with nextAction) → high
  if (d.category === 'hot' && d.followUpStatus === 'needs_attention') {
    const conf = probabilityPhrase(d);
    const confSuffix = conf ? ` (${conf})` : '';
    return {
      priority: 'high',
      reason: `Hot ${roleNoun(d.opportunityType)}${confSuffix} needs follow-up — last contact ${daysPhrase(d.daysSinceContact)} ago.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 13. Nurture + no nextAction → medium
  if (d.category === 'nurture' && !hasNextAction(d)) {
    const role = roleNoun(d.opportunityType);
    const reason =
      d.followUpStatus === 'needs_attention'
        ? `Nurture ${role} going cold and has no defined next step.`
        : `Nurture ${role} has no defined next step.`;
    return {
      priority: 'medium',
      reason,
      suggestedTouch: 'Set one concrete next step for your next check-in.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 14. Nurture + needs_attention (with nextAction) → medium
  if (d.category === 'nurture' && d.followUpStatus === 'needs_attention') {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} going cold — last contact ${daysPhrase(d.daysSinceContact)} ago.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 15. Hot on_track (with nextAction) → medium
  if (d.category === 'hot') {
    const conf = probabilityPhrase(d);
    const confClause = conf ? ` at ${conf} confidence` : '';
    return {
      priority: 'medium',
      reason: `Hot ${roleNoun(d.opportunityType)}${confClause} — keep momentum.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // 16. Nurture + targetTimeframe (on_track, has nextAction) → medium
  //     Timeframe is in the reason — exclude it from the context note.
  if (d.category === 'nurture' && d.targetTimeframe?.trim()) {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} targeting ${d.targetTimeframe.trim()} — keep them warm.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d, ['timeframe']),
    };
  }

  // 17. Watch + no nextAction → low
  if (d.category === 'watch' && !hasNextAction(d)) {
    return {
      priority: 'low',
      reason: 'Long-term contact has no defined next step.',
      suggestedTouch: 'Set a future check-in plan.',
      suggestedValueAdd: 'Send a light market update when appropriate.',
      contextNote: contextNoteOf(d),
    };
  }

  // 18. Watch + has nextAction → low
  if (d.category === 'watch') {
    return {
      priority: 'low',
      reason: 'Long-term contact — plan is set.',
      suggestedTouch: smartTouch(d),
      suggestedValueAdd:
        'Light touch only — share when something genuinely useful comes up.',
      contextNote: contextNoteOf(d),
    };
  }

  // 19. Fallback (Nurture on_track, has nextAction, no timeframe)
  return {
    priority: 'low',
    reason: `${CATEGORY_LABELS[d.category]} ${roleNoun(d.opportunityType)} on track.`,
    suggestedTouch: smartTouch(d),
    suggestedValueAdd: valueAddByType(d),
    contextNote: contextNoteOf(d),
  };
}

// ============================================
// Sort & briefing helpers
// ============================================

export interface DealWithInsight extends DealWithUrgency {
  insight: BadgerInsight;
}

const PRIORITY_ORDER: Record<InsightPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function sortByInsightPriority(items: DealWithInsight[]): DealWithInsight[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.insight.priority] - PRIORITY_ORDER[b.insight.priority];
    if (p !== 0) return p;
    if (a.daysSinceContact !== b.daysSinceContact) return b.daysSinceContact - a.daysSinceContact;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export const CALM_BRIEFING_MESSAGE =
  'All active deals are on track. Use this window to deepen a Nurture or Watch relationship.';
