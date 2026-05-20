import type {
  Deal,
  DealWithUrgency,
  BadgerInsight,
  InsightPriority,
  OpportunityType,
} from '../types';
import { STAGE_LABELS, CATEGORY_LABELS } from '../constants/pipeline';
import { formatPriceRange } from './priceRange';

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
      return `Drop a quick inventory snapshot for ${areaPhrase(d)}.`;
    case 'sell':
      return `Send fresh comps for ${areaPhrase(d)}.`;
    case 'rent':
      return `Share a rental market read for ${areaPhrase(d)}.`;
    case 'both':
      return `Send what's actually moving in ${areaPhrase(d)}.`;
    default:
      return `Share a market read worth their time for ${areaPhrase(d)}.`;
  }
}

function touchByType(d: Deal): string {
  switch (d.opportunityType) {
    case 'buy':
      return 'Send a few current listings or pitch a tour window.';
    case 'sell':
      return 'Check in on prep, staging, or where the price should land.';
    case 'rent':
      return 'Send a fresh batch of rental options.';
    case 'both':
      return "Check both sides — what's selling and what they're hunting for.";
    default:
      return 'Reach out with something they can actually use.';
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
  // Buy side — uses the locked range format with full comma values.
  if (d.opportunityType === 'buy' || d.opportunityType === 'both') {
    const range = formatPriceRange(d.priceRangeLow, d.priceRangeHigh);
    if (range) return range;
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
  reason: "Closed. Nice work — nothing to chase here.",
  suggestedTouch: 'Maybe line up a future check-in so the referral stays warm.',
  suggestedValueAdd: '',
};

export function computeInsight(d: DealWithUrgency): BadgerInsight {
  // 1. Closed → no actionable insight.
  if (d.stage === 'closed') return CLOSED_INSIGHT;

  // 2. Never contacted → log first touch (beats every category/stage rule).
  if (d.neverContacted) {
    return {
      priority: 'high',
      reason: 'New name, zero history. Not one logged touch on this client yet.',
      suggestedTouch: 'Make first contact and log it, before they forget they reached out.',
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
        reason: pricedReason(d, `This one breaks if you blink. Under contract with an open blocker: ${d.blocker!.trim()}.`),
        suggestedTouch:
          'Get a straight answer on the blocker now, with an owner and a date attached.',
        suggestedValueAdd:
          'Send a closing checklist with that open item flagged.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3b. Overdue Next Step → critical.
    if (isOverdue(d.nextStepDue)) {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `The clock's running and this slipped. Under contract, and "${d.nextStep ?? 'the next step'}" was due ${formatDueDate(d.nextStepDue!)}.`,
        ),
        suggestedTouch: 'Close out that step before the contract timeline bites.',
        suggestedValueAdd: 'Send an escrow checklist so nothing else slips.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3c. No Next Step at all → critical, define one now.
    if (!hasNextStep(d)) {
      return {
        priority: 'high',
        reason: pricedReason(d, "Under contract with nothing on the board. That's how clean deals go sideways."),
        suggestedTouch:
          'Set the next concrete step now — contracts do not manage themselves.',
        suggestedValueAdd: 'Send an escrow checklist to anchor the next steps.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3d. Cold by category cadence → close-risk.
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Under contract and quiet for ${daysPhrase(d.daysSinceContact)}. Silence is risk this close to the finish.`,
        ),
        suggestedTouch: 'Check the timeline and open items while there is still runway.',
        suggestedValueAdd: 'Send an escrow checklist so nothing gets missed.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3e. On track Under Contract — surface as medium so it stays on Today.
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Under contract and on track. Keep it that way.'),
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
        reason: pricedReason(d, `The listing's snagged on ${d.blocker!.trim()}. Stuck listings quietly stop getting attention.`),
        suggestedTouch: 'Clear what is jamming it — price, prep, or access — and keep it moving.',
        suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Your seller's been in the dark for ${daysPhrase(d.daysSinceContact)}. That's how sellers start shopping for another agent.`,
        ),
        suggestedTouch:
          'Send showing feedback, what the market is doing, and your read.',
        suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextStep(d)) {
      return {
        priority: 'medium',
        reason: pricedReason(d, 'Active listing, no plan on the board.'),
        suggestedTouch: 'Lock a weekly update rhythm so the seller always knows where things stand.',
        suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Listing is moving. Keep the updates flowing.'),
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
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
        reason: `Buyer's stuck on ${d.blocker!.trim()}. Momentum dies fast once it stalls.`,
        suggestedTouch: 'Clear the blocker before they cool off or drift to another agent.',
        suggestedValueAdd: 'Re-confirm budget and must-haves while they are engaged.',
        contextNote: contextNoteOf(d),
      };
    }
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: `Your buyer's gone cold — ${daysPhrase(d.daysSinceContact)} since the last contact.`,
        suggestedTouch: `Send 2–3 fresh listings in ${areaPhrase(d)} and offer a tour window.`,
        suggestedValueAdd:
          'Re-confirm budget and must-haves before the search loses steam.',
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextStep(d)) {
      return {
        priority: 'medium',
        reason: 'Active buyer, no next step — momentum with nowhere to go.',
        suggestedTouch:
          'Plan a showing window or send a curated short list.',
        suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: 'Buyer is engaged — keep the momentum.',
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
        reason: 'Fresh buyer lead — strike while they are still excited.',
        suggestedTouch:
          'Book a discovery call: budget, timeline, must-haves.',
        suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (d.opportunityType === 'sell' || d.opportunityType === 'both') {
      return {
        priority: 'medium',
        reason: 'Fresh seller lead — get the prelisting motion started.',
        suggestedTouch: 'Book a walkthrough and a real pricing conversation.',
        suggestedValueAdd: `Send recent comps in ${areaPhrase(d)} and a prelisting checklist.`,
        contextNote: contextNoteOf(d),
      };
    }
    // Type unset — generic lead nudge
    return {
      priority: 'medium',
      reason: 'New lead, intent unknown — figure out if they are buying, selling, or both.',
      suggestedTouch: 'Quick discovery call to nail down intent and timeline.',
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
      reason: `Hot client jammed up: ${d.blocker!.trim()}. Hot plus blocked is a deal you can lose.`,
      suggestedTouch: 'Get on it with the client directly before this one cools.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Overdue next step (any category, any stage that fell through above) → bump.
  if (hasNextStep(d) && isOverdue(d.nextStepDue)) {
    return {
      priority: d.category === 'watch' ? 'medium' : 'high',
      reason: `Past due. "${d.nextStep!.trim()}" was due ${formatDueDate(d.nextStepDue!)} and it's still open.`,
      suggestedTouch: "Knock it out, or move it to a deadline that'll stick.",
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
        ? `Hot ${role}${confSuffix} with no next step, and ${daysPhrase(d.daysSinceContact)} of silence. That's a lead going to waste.`
        : `Hot ${role}${confSuffix} and not a single next step on the board.`;
    return {
      priority: 'high',
      reason,
      suggestedTouch: 'Decide the one move that gets this going, then make it.',
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
      reason: `Hot ${roleNoun(d.opportunityType)}${confSuffix} cooling off — ${daysPhrase(d.daysSinceContact)} since you last connected.`,
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
        ? `Nurture ${role} slipping cold with nothing planned to pull them back.`
        : `Nurture ${role} with no next step set.`;
    return {
      priority: 'medium',
      reason,
      suggestedTouch: 'Pin a concrete step for your next check-in.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Nurture, needs attention.
  if (d.category === 'nurture' && d.followUpStatus === 'needs_attention') {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} going quiet — ${daysPhrase(d.daysSinceContact)} since the last touch.`,
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
      reason: `Hot ${roleNoun(d.opportunityType)}${confClause} and on track — keep the heat on.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Nurture with target timeframe.
  if (d.category === 'nurture' && d.targetTimeframe?.trim()) {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} eyeing ${d.targetTimeframe.trim()} — keep them warm so you're the call they make.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d, ['timeframe']),
    };
  }

  // Watch.
  if (d.category === 'watch' && !hasNextStep(d)) {
    return {
      priority: 'low',
      reason: 'Long-game contact with no plan to check back in.',
      suggestedTouch: 'Set a future check-in so they do not fall off the radar.',
      suggestedValueAdd: 'Send a light market update when something is worth it.',
      contextNote: contextNoteOf(d),
    };
  }

  if (d.category === 'watch') {
    return {
      priority: 'low',
      reason: "Long-game contact — plan's set, nothing urgent.",
      suggestedTouch: smartTouch(d),
      suggestedValueAdd:
        'Light touch only — reach out when something genuinely useful comes up.',
      contextNote: contextNoteOf(d),
    };
  }

  // Fallback (Nurture on track, has next step, no timeframe).
  return {
    priority: 'low',
    reason: `${CATEGORY_LABELS[d.category]} ${roleNoun(d.opportunityType)} — on track, no fires.`,
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
  "Everything's on track — rare and a little suspicious. Use the quiet to deepen a Nurture or Watch relationship.";
