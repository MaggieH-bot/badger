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
      return `Send a sharp inventory snapshot for ${areaPhrase(d)} — give them a reason to lean in.`;
    case 'sell':
      return `Send fresh comps for ${areaPhrase(d)} so they see you're already working.`;
    case 'rent':
      return `Send a quick rental market read for ${areaPhrase(d)}.`;
    case 'both':
      return `Send what's moving in ${areaPhrase(d)} — both sides.`;
    default:
      return `Send a market read worth their time for ${areaPhrase(d)}.`;
  }
}

function touchByType(d: Deal): string {
  switch (d.opportunityType) {
    case 'buy':
      return 'Send a few listings or pitch a tour window — give them momentum.';
    case 'sell':
      return 'Check in on prep, staging, or price — keep it moving toward listed.';
    case 'rent':
      return 'Send a fresh batch of rentals while the interest is hot.';
    case 'both':
      return "Hit both sides — what's selling and what they're hunting.";
    default:
      return 'Reach out with something they can use, today.';
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
  reason: "Closed — that's a win, take the lap. This one's done.",
  suggestedTouch: 'Lock a future check-in now so the referral pipeline keeps feeding you.',
  suggestedValueAdd: '',
};

export function computeInsight(d: DealWithUrgency): BadgerInsight {
  // 1. Closed → no actionable insight.
  if (d.stage === 'closed') return CLOSED_INSIGHT;

  // 2. Never contacted → log first touch (beats every category/stage rule).
  if (d.neverContacted) {
    return {
      priority: 'high',
      reason: "New opportunity on the board, and it's all upside — but totally untouched. Every cold day is a day someone else calls first.",
      suggestedTouch: 'Make the intro today and log it — get the clock started in your favor.',
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
        reason: pricedReason(d, `You're one step from the closing table — don't trip here. One open blocker stands in the way: ${d.blocker!.trim()}.`),
        suggestedTouch:
          'Get a straight answer on it today — owner and date attached.',
        suggestedValueAdd:
          'Send a closing checklist with that open item front and center.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3b. Overdue Next Step → critical.
    if (isOverdue(d.nextStepDue)) {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `So close to done — let's not stall now. "${d.nextStep ?? 'the next step'}" was due ${formatDueDate(d.nextStepDue!)} and it's still open.`,
        ),
        suggestedTouch: 'Close it out today, before the contract timeline turns on you.',
        suggestedValueAdd: 'Send an escrow checklist so nothing else slips.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3c. No Next Step at all → critical, define one now.
    if (!hasNextStep(d)) {
      return {
        priority: 'high',
        reason: pricedReason(d, "You fought to get this under contract — now protect it. Nothing's on the board moving it toward close."),
        suggestedTouch:
          'Set the next concrete step now — under contract is no time to coast.',
        suggestedValueAdd: 'Send an escrow checklist to anchor the next moves.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3d. Cold by category cadence → close-risk.
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `In the home stretch but it's gone quiet for ${daysPhrase(d.daysSinceContact)} — silence is the enemy this close to close.`,
        ),
        suggestedTouch: 'Check the timeline and open items today, while there is runway.',
        suggestedValueAdd: 'Send an escrow checklist so nothing gets missed.',
        contextNote: contextNoteOf(d),
      };
    }

    // 3e. On track Under Contract — surface as medium so it stays on Today.
    return {
      priority: 'medium',
      reason: pricedReason(d, 'Under contract and on track — great spot to be in. Now keep it locked.'),
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
        reason: pricedReason(d, `This listing's got real potential — don't let it stall on ${d.blocker!.trim()}. Stuck listings quietly stop getting attention.`),
        suggestedTouch: 'Clear what is jamming it today — price, prep, or access — and get it showing.',
        suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: pricedReason(
          d,
          `Your seller hasn't heard from you in ${daysPhrase(d.daysSinceContact)} — and that's how good listings start shopping for a new agent.`,
        ),
        suggestedTouch:
          'Send showing feedback, market activity, and your read — today.',
        suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextStep(d)) {
      return {
        priority: 'medium',
        reason: pricedReason(d, 'Active listing with momentum to protect — but no plan on the board.'),
        suggestedTouch: 'Lock a weekly update rhythm so the seller always knows you are driving.',
        suggestedValueAdd: `Send fresh comps for ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: pricedReason(d, "Listing's moving and you're on it — nice. Keep the updates flowing."),
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
        reason: `Your buyer's ready to move — don't let ${d.blocker!.trim()} stall them. Buyer momentum dies fast once it stalls.`,
        suggestedTouch: 'Clear the blocker today, before they cool off or wander to another agent.',
        suggestedValueAdd: "Re-confirm budget and must-haves while they're fired up.",
        contextNote: contextNoteOf(d),
      };
    }
    if (d.followUpStatus === 'needs_attention') {
      return {
        priority: 'high',
        reason: `This buyer was engaged — and it's been ${daysPhrase(d.daysSinceContact)} of quiet. That's how live buyers go dark.`,
        suggestedTouch: `Send 2–3 fresh listings in ${areaPhrase(d)} and grab a tour window this week.`,
        suggestedValueAdd:
          'Re-confirm budget and must-haves before the search loses steam.',
        contextNote: contextNoteOf(d),
      };
    }
    if (!hasNextStep(d)) {
      return {
        priority: 'medium',
        reason: 'Active buyer with real momentum — and nowhere for it to go yet.',
        suggestedTouch:
          'Plan a showing window or send a curated short list today.',
        suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    return {
      priority: 'medium',
      reason: "Buyer's engaged and you're driving it — keep the momentum rolling.",
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
        reason: "Fresh buyer lead — that's a real shot. Strike while they're still excited.",
        suggestedTouch:
          'Book a discovery call today: budget, timeline, must-haves.',
        suggestedValueAdd: `Send a starter set of listings in ${areaPhrase(d)}.`,
        contextNote: contextNoteOf(d),
      };
    }
    if (d.opportunityType === 'sell' || d.opportunityType === 'both') {
      return {
        priority: 'medium',
        reason: 'A seller just raised their hand — that\'s a real shot, and "interested" has a shelf life.',
        suggestedTouch: 'Book the walkthrough and a real pricing conversation before the spark fades.',
        suggestedValueAdd: `Send recent comps in ${areaPhrase(d)} and a prelisting checklist.`,
        contextNote: contextNoteOf(d),
      };
    }
    // Type unset — generic lead nudge
    return {
      priority: 'medium',
      reason: 'New lead, fresh and full of potential — you just need to know what they want.',
      suggestedTouch: 'Quick discovery call today to lock down intent and timeline.',
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
      reason: `Hot client, hot opportunity — and ${d.blocker!.trim()} is the one thing in the way. Hot plus blocked is how you lose a winnable deal.`,
      suggestedTouch: 'Get on it with the client directly today, before it cools.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Overdue next step (any category, any stage that fell through above) → bump.
  if (hasNextStep(d) && isOverdue(d.nextStepDue)) {
    return {
      priority: d.category === 'watch' ? 'medium' : 'high',
      reason: `Don't let this slide — "${d.nextStep!.trim()}" was due ${formatDueDate(d.nextStepDue!)} and momentum's leaking.`,
      suggestedTouch: "Knock it out today, or give it a deadline that'll actually stick.",
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
        ? `Hot ${role}${confSuffix} — a live one, and it's been ${daysPhrase(d.daysSinceContact)} quiet with no plan. Don't let a winner slip away.`
        : `Hot ${role}${confSuffix} with everything going for it — except a next step to keep it moving.`;
    return {
      priority: 'high',
      reason,
      suggestedTouch: 'Decide the one move that pushes this forward, then make it today.',
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
      reason: `Hot ${roleNoun(d.opportunityType)}${confSuffix} cooling fast — ${daysPhrase(d.daysSinceContact)} since you connected. This is a deal worth saving.`,
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
        ? `Nurture ${role} slipping cold with no plan to win them back — easy to fix if you move now.`
        : `Nurture ${role} with real potential, but no next step on the board.`;
    return {
      priority: 'medium',
      reason,
      suggestedTouch: 'Pin a concrete step for your next check-in — keep them in your orbit.',
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Nurture, needs attention.
  if (d.category === 'nurture' && d.followUpStatus === 'needs_attention') {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} going quiet — ${daysPhrase(d.daysSinceContact)} since the last touch. Stay top of mind or someone else will.`,
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
      reason: `Hot ${roleNoun(d.opportunityType)}${confClause} and humming — you're doing this right. Keep the heat on.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d),
    };
  }

  // Nurture with target timeframe.
  if (d.category === 'nurture' && d.targetTimeframe?.trim()) {
    return {
      priority: 'medium',
      reason: `Nurture ${roleNoun(d.opportunityType)} eyeing ${d.targetTimeframe.trim()} — a future deal with your name on it if you stay warm.`,
      suggestedTouch: smartTouch(d),
      suggestedValueAdd: valueAddByType(d),
      contextNote: contextNoteOf(d, ['timeframe']),
    };
  }

  // Watch.
  if (d.category === 'watch' && !hasNextStep(d)) {
    return {
      priority: 'low',
      reason: 'Long-game contact worth keeping alive — but no plan to check back in.',
      suggestedTouch: 'Set a future check-in now so they do not drift off your radar.',
      suggestedValueAdd: "Send a light market update when something's genuinely worth it.",
      contextNote: contextNoteOf(d),
    };
  }

  if (d.category === 'watch') {
    return {
      priority: 'low',
      reason: "Long-game contact and you've got a plan — nicely handled.",
      suggestedTouch: smartTouch(d),
      suggestedValueAdd:
        'Light touch only — reach out when something genuinely useful comes up.',
      contextNote: contextNoteOf(d),
    };
  }

  // Fallback (Nurture on track, has next step, no timeframe).
  return {
    priority: 'low',
    reason: `${CATEGORY_LABELS[d.category]} ${roleNoun(d.opportunityType)} on track and under control — keep it rolling.`,
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
  "Whole board's on track — nice work, that doesn't happen by accident. Use the quiet to deepen a Nurture or Watch relationship before it heats up.";
