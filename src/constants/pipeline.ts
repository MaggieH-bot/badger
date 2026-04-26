import type {
  Stage,
  Assignee,
  ContactMethod,
  DocumentType,
  Category,
  OpportunityType,
} from '../types';

export const STAGES: readonly Stage[] = [
  'lead',
  'prospect',
  'active',
  'under_contract',
  'closing',
  'closed',
] as const;

export const ACTIVE_STAGES: readonly Stage[] = [
  'lead',
  'prospect',
  'active',
  'under_contract',
  'closing',
] as const;

export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  active: 'Active',
  under_contract: 'Under Contract',
  closing: 'Closing',
  closed: 'Closed',
};

// Stage overrides — apply only to specific late-transaction stages.
// All other stages fall through to category cadence.
export const STAGE_CADENCE_OVERRIDES: Partial<Record<Stage, number>> = {
  under_contract: 2,
  closing: 1,
};

// Active seller-side listing cadence override.
// Applies when stage = 'active' AND opportunityType in {'sell', 'both'}.
// Tighter than Hot's 7-day default — live listings need regular updates.
export const ACTIVE_LISTING_CADENCE_DAYS = 5;

export const ASSIGNEES: readonly Assignee[] = [
  'You',
  'TC',
  'VA',
  'Partner',
] as const;

export const CONTACT_METHODS: readonly ContactMethod[] = [
  'call',
  'text',
  'email',
  'in_person',
  'other',
] as const;

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  call: 'Call',
  text: 'Text',
  email: 'Email',
  in_person: 'In Person',
  other: 'Other',
};

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'agreement',
  'disclosure',
  'inspection',
  'addendum',
  'correspondence',
  'other',
] as const;

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  agreement: 'Agreement',
  disclosure: 'Disclosure',
  inspection: 'Inspection',
  addendum: 'Addendum',
  correspondence: 'Correspondence',
  other: 'Other',
};

// --- Pipeline category (PRIMARY readiness lens) ---

export const CATEGORIES: readonly Category[] = ['hot', 'nurture', 'watch'] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  hot: 'Hot',
  nurture: 'Nurture',
  watch: 'Watch',
};

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  hot: '0–3 months out',
  nurture: '3–6 months out',
  watch: '6–12 months out',
};

// Outreach cadence per category, in days.
// Drives follow-up urgency unless a stage override applies (see STAGE_CADENCE_OVERRIDES).
export const CATEGORY_CADENCE_DAYS: Record<Category, number> = {
  hot: 7,
  nurture: 21,
  watch: 60,
};

// --- Opportunity type ---

export const OPPORTUNITY_TYPES: readonly OpportunityType[] = [
  'buy',
  'sell',
  'both',
  'rent',
] as const;

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  buy: 'Buy',
  sell: 'Sell',
  both: 'Both',
  rent: 'Rent',
};
