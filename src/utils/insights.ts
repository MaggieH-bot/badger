import type {
  Deal,
  DealWithUrgency,
  BadgerInsight,
  InsightPriority,
  OpportunityType,
} from '../types';
import { STAGE_LABELS, CATEGORY_LABELS } from '../constants/pipeline';

// ============================================
// Helpers — build copy from existing fields, never leak undefined
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

// Surface nextStep as the touch when present; otherwise fall back to type-based.
function smartTouch(d: Deal): string {
  const next = d.nextStep?.trim();
  if (next) return `Next up: ${next}`;
  return touchByType(d);
}

function daysPhrase(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function hasNextStep(d: Deal): boolean {
  return Boolean(d.nextStep?.trim());
}

function hasBlocker(d: Deal): boolean {
  return Boolean(d.blocker?.trim());
}

function isOverdue(due: string | undefined, now: Date = new Date()): boolean {
  if (!due) return false;
  return new Date(due).getTime() < now.getTime();
}

function formatDueDate(due: string): string {
  return new Date(due).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Context-aware price phrase. Prefers the typed columns; falls back to legacy `price`.
function pricePhrase(d: Deal): string | null {
  // Closed: closed price wins
  if (d.stage === 'closed' && d.closedPrice !== undefined) {
    return formatPriceShort(d.closedPrice);
  }
  // Sell side
  if (
    (d.opportunityType === 'sell' || d.opportunityType === 'both') &&
    d.listPrice !== undefined
  ) {
    return formatPriceShort(d.listPrice);
  }
  // Buy side
  if (
    (d.opportunityType === 'buy' || d.opportunityType === 'both') &&
    (d.priceRangeLow !== undefined || d.priceRangeHigh !== undefined)
  ) {
    const lo = d.priceRangeLow !== undefined ? formatPriceShort(d.priceRangeLow) : '';
    const hi = d.priceRangeHigh !== undefined ? formatPriceShort(d.priceRangeHigh) : '';
    if (lo && hi) return `${lo}–${hi}`;
    return lo || hi;
  }
  // Legacy fallback
  if (d.price !== undefined && d.price > 0) {
    return formatPriceShort(d.price);
  }
  return null;
}

function formatPriceShort(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '';
  if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (p >= 1_000) return `$${Math.round(p / 1_000)}K`;
  return `$${p}`;
}

function probabilityPhrase(d: Deal): string | null {
  return d.probability !== undefined ? `${d.probability}%` : null;
}

function pricedReason(d: Deal, base: string): string {
  const pp = pricePhrase(d);
  return pp ? `${pp} — ${base}` : base;
}

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

// ============================================
// Rules — first match wins, evaluated top-to-bottom
// ============================================

const CLOSED_INSIGHT: BadgerInsight = {
  priority: 'low',
  reason: 'Client closed.',
  suggestedTouch: '',
  suggestedValueAdd: '',
};

export function computeInsight(d: DealWithUrgency): BadgerInsight {
  // 1. Closed → no actionable insight.
  if (d.stage === 'closed') return CLOSED_INSIGHT;

  // 2. Never contacted → log first touch (beats every category/stage rule).
  if (d.neverContacted) {
    return {
      priority: 'high',
      reason: 'No contact has been logged for this client yet.',
      suggestedTouch: 'Reach out and log your first touch.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // ============================================
  // Under Contract escalation block (Stage = transactional sensitivity)
  // Per locked rule: Under Contract is NOT a cadence override. It's a set of
  // surface-on-Today rules driven by specific signals.
  // ============================================

  if (d.stage === 'under_contract') {
    // 3a. Blocker → critical, contract at risk.
    if (hasBlocker(d)) {
      return {
        priority: 'high',
        reason: pricedReason(d, `Under Contract — blocked: ${d.blocker!.trim()}`),
        suggestedTouch:
          'Resolve the blocker with the client today — the close depends on it.',
        suggestedValueAdd:
          'Send a closing checklist with the open item highlighted.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3b. Overdue Next Step → critical.
    if (isOverdue(d.nextStepDue)) {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Under Contract — overdue: "${d.nextStep ?? 'next step'}" was due ${formatDueDate(d.nextStepDue!)}.`,
        ),
        suggestedTouch: 'Catch up the overdue step today.',
        suggestedValueAdd: 'Send a closing/escrow checklist.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3c. No Next Step at all → critical, define one now.
    if (!hasNextStep(d)) {
      return {
        priority: 'high',
        reason: pricedReason(d, 'Under Contract — no next step defined.'),
        suggestedTouch:
          'Set the next concrete step today. Contracts can break without active management.',
        suggestedValueAdd: 'Send a closing/escrow checklist.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3d. Cold by category cadence → close-risk.
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Under Contract — last touch was ${daysPhrase(d.daysSinceContact)} ago.`,
        ),
        suggestedTouch: 'Confirm timeline and outstanding items today.',
        suggestedValueAdd: 'Send a closing/escrow checklist.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3e. On track Under Contract — surface as medium so it stays on Today.
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Under Contract — protect the timeline.'),
      suggestedTouch: smartTouch(d),
      suggestedValueAdd:
        'Confirm contingencies, inspection dates, and lender deadlines.',
      contextNote: contextNoteOf(d),
    };
  }

  // ============================================
  // Listing-stage escalation (sell or both)
  // ============================================

  if (d.stage === 'listing') {
    if (hasBlocker(d)) {
      return {
        priority: 'high',
        reason: pricedReason(d, `Listing blocked: ${d.blocker!.trim()}`),
        suggestedTouch: 'Tackle the blocker so the listing keeps moving.',
        suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Listing hasn't had a touch in ${daysPhrase(d.daysSinceContact)}.`,
        ),
        suggestedTouch:
          'Send showing feedback, market activity, and a recommendation.',
        suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextStep(d)) {
      return {
        priority: 'medium',
        reason: pricedReason(d, 'Listing has no defined next step.'),
        suggestedTouch: 'Set a recurring update cadence (weekly market touch).',
        suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Listing — keep regular updates flowing.'),
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: `Send recent comparable sales in ${areaPhrase(d)}.`,
      contextNote: contextNoteOf(d),
    };
  }

  // ============================================
  // Active Buyer-stage escalation
  // ============================================

  if (d.stage === 'active_buyer') {
    if (hasBlocker(d)) {
      return {
        priority: 'high',
        reason: `Active buyer blocked: ${d.blocker!.trim()}`,
        suggestedTouch: 'Tackle the blocker — buyer momentum stalls fast.',
        suggestedValueAdd: 'Re-confirm budget and must-haves before momentum stalls.',
        contextNote: contextNoteOf(d),
      };
    }
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: `Active buyer cooled off — ${daysPhrase(d.daysSinceContact)} since last contact.`,
        suggestedTouch: `Send 2–3 fresh listings in ${areaPhrase(d)} and offer a tour window this week.`,
        suggestedValueAdd:
          'Re-confirm budget and must-haves before momentum stalls.',
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextStep(d)) {
      return {
        priority: 'medium',
        reason: 'Active buyer has no defined next step.',
        suggestedTouch:
          'Plan the next showing window or share a curated list.',
        suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: 'Active buyer — keep momentum.',
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // ============================================
  // Lead-stage rules
  // ============================================

  if (d.stage === 'lead') {
    if (d.opportunityType === 'buy' || d.opportunityType === 'rent') {
      return {
        priority: 'medium',
        reason: 'New buyer lead — activate them while interest is fresh.',
        suggestedTouch:
          'Schedule a discovery call: budget, timeline, must-haves.',
        suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (d.opportunityType === 'sell' || d.opportunityType === 'both') {
      return {
        priority: 'medium',
        reason: 'New seller lead — start prelisting prep.',
        suggestedTouch: 'Schedule a walkthrough and pricing conversation.',
        suggestedValueAdd: `Send recent comps in ${areaPhrase(d)} and a prelisting checklist.`,
        contextNote: contextNoteOf(d),
      };
    }
    // Type unset — generic lead nudge
    return {
      priority: 'medium',
      reason: 'New lead — confirm Buy / Sell / Both intent.',
      suggestedTouch: 'Discovery call to establish intent and timeline.',
      suggestedValueAdd: 'Light market overview based on their stated area.',
      contextNote: contextNoteOf(d),
    };
  }

  // ============================================
  // Category-driven rules (catch-all for non-stage-specific situations)
  // ============================================

  // Blocker on a Hot client (any non-stage-specific) → high.
  if (d.category === 'hot' && hasBlocker(d)) {
    return {
      priority: 'high',
      reason: `Hot client blocked: ${d.blocker!.trim()}`,
      suggestedTouch: 'Tackle the blocker with the client directly.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Overdue next step (any category, any stage that fell through above) → bump.
  if (hasNextStep(d) && isOverdue(d.nextStepDue)) {
    return {
      priority: d.category === 'watch' ? 'medium' : 'high',
      reason: `Overdue: "${d.nextStep!.trim()}" was due ${formatDueDate(d.nextStepDue!)}.`,
      suggestedTouch: 'Catch up the overdue step today.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Hot, no next step.
  if (d.category === 'hot' && !hasNextStep(d)) {
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

  // Hot, needs attention (with next step).
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

  // Nurture, no next step.
  if (d.category === 'nurture' && !hasNextStep(d)) {
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

  // Nurture, needs attention.
  if (d.category === 'nurture' && d.followUpStatus === 'needs_attention') {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} going cold — last contact ${daysPhrase(d.daysSinceContact)} ago.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Hot on track.
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

  // Nurture with target timeframe.
  if (d.category === 'nurture' && d.targetTimeframe?.trim()) {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} targeting ${d.targetTimeframe.trim()} — keep them warm.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d, ['timeframe']),
    };
  }

  // Watch.
  if (d.category === 'watch' && !hasNextStep(d)) {
    return {
      priority: 'low',
      reason: 'Long-term contact has no defined next step.',
      suggestedTouch: 'Set a future check-in plan.',
      suggestedValueAdd: 'Send a light market update when appropriate.',
      contextNote: contextNoteOf(d),
    };
  }

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

  // Fallback (Nurture on track, has next step, no timeframe).
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

// Reference STAGE_LABELS to keep the import alive (used implicitly through formatters).
void STAGE_LABELS;

export const CALM_BRIEFING_MESSAGE =
  'All active clients are on track. Use this window to deepen a Nurture or Watch relationship.';
