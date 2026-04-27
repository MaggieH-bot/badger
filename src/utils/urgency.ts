import type { Deal, DealWithUrgency, Urgency, FollowUpStatus } from '../types';
import { CATEGORY_CADENCE_DAYS } from '../constants/pipeline';

function daysBetween(isoDate: string, now: Date): number {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Resolve the effective outreach cadence (in days) for a deal.
// Pure category-driven: Hot 7, Nurture 21, Watch 60.
// Stage does NOT override cadence — it adds insight-level escalation in
// insights.ts (e.g. Under Contract + blocker → high) but never overrides the
// user-set Category.
export function effectiveCadenceDays(deal: Deal): number | null {
  if (deal.stage === 'closed') return null;
  return CATEGORY_CADENCE_DAYS[deal.category];
}

export function followUpStatusOf(urgency: Urgency): FollowUpStatus {
  if (urgency === 'none') return 'none';
  if (urgency === 'on_track') return 'on_track';
  // cold + warming both map to needs_attention
  return 'needs_attention';
}

export function computeUrgency(deal: Deal, now: Date = new Date()): DealWithUrgency {
  // Closed deals always produce 'none' regardless of contact history.
  if (deal.stage === 'closed') {
    return {
      ...deal,
      urgency: 'none',
      followUpStatus: 'none',
      daysSinceContact: 0,
      neverContacted: !deal.lastContact,
    };
  }

  // Never-contacted deals: surface as cold / needs-attention immediately.
  // No cadence math — there's no anchor to measure from.
  if (!deal.lastContact) {
    return {
      ...deal,
      urgency: 'cold',
      followUpStatus: 'needs_attention',
      daysSinceContact: 0,
      neverContacted: true,
    };
  }

  const daysSinceContact = daysBetween(deal.lastContact, now);
  const cadence = effectiveCadenceDays(deal);

  let urgency: Urgency;

  if (cadence === null) {
    urgency = 'none';
  } else {
    const ratio = daysSinceContact / cadence;
    if (ratio >= 1.0) {
      urgency = 'cold';
    } else if (ratio >= 0.6) {
      urgency = 'warming';
    } else {
      urgency = 'on_track';
    }
  }

  return {
    ...deal,
    urgency,
    followUpStatus: followUpStatusOf(urgency),
    daysSinceContact,
    neverContacted: false,
  };
}

const URGENCY_SORT_ORDER: Record<Urgency, number> = {
  cold: 0,
  warming: 1,
  on_track: 2,
  none: 3,
};

export function sortForTodayView(deals: DealWithUrgency[]): DealWithUrgency[] {
  return [...deals]
    .filter((d) => d.stage !== 'closed')
    .sort((a, b) => {
      const urgencyDiff = URGENCY_SORT_ORDER[a.urgency] - URGENCY_SORT_ORDER[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;

      const contactDiff = b.daysSinceContact - a.daysSinceContact;
      if (contactDiff !== 0) return contactDiff;

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

// Sort within a single category bucket for Today view
// needs_attention first, then daysSinceContact desc, then updatedAt desc
export function sortByAttentionWithinCategory(deals: DealWithUrgency[]): DealWithUrgency[] {
  return [...deals].sort((a, b) => {
    const aNeeds = a.followUpStatus === 'needs_attention' ? 0 : 1;
    const bNeeds = b.followUpStatus === 'needs_attention' ? 0 : 1;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;

    const contactDiff = b.daysSinceContact - a.daysSinceContact;
    if (contactDiff !== 0) return contactDiff;

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
