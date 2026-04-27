import type {
  Stage,
  Assignee,
  ContactMethod,
  DocumentType,
  Category,
  OpportunityType,
  Sequencing,
} from '../types';

// V1 stage model. The full set is shared, but each Opportunity Type uses a subset
// (see VALID_STAGES_BY_TYPE below).
export const STAGES: readonly Stage[] = [
  'lead',
  'listing',
  'active_buyer',
  'under_contract',
  'closed',
] as const;

export const ACTIVE_STAGES: readonly Stage[] = [
  'lead',
  'listing',
  'active_buyer',
  'under_contract',
] as const;

export const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Lead',
  listing: 'Listing',
  active_buyer: 'Active Buyer',
  under_contract: 'Under Contract',
  closed: 'Closed',
};

// Which Stages are valid for a given Opportunity Type. The form/drawer uses
// this to filter the Stage dropdown so users can't pick incoherent combos.
// 'both' permits all stages (the active lane drives which one is shown).
// 'rent' rides on the buyer-side path.
// undefined opportunity type → only the universal stages.
export const VALID_STAGES_BY_TYPE: Record<OpportunityType, readonly Stage[]> = {
  buy: ['lead', 'active_buyer', 'under_contract', 'closed'],
  sell: ['lead', 'listing', 'under_contract', 'closed'],
  both: ['lead', 'listing', 'active_buyer', 'under_contract', 'closed'],
  rent: ['lead', 'active_buyer', 'under_contract', 'closed'],
};

export const VALID_STAGES_WITHOUT_TYPE: readonly Stage[] = ['lead', 'closed'];

// Per-stage attention escalation:
//   No cadence overrides — Stage does NOT compete with Category for cadence days.
//   Stage adds insight-level escalation in insights.ts (e.g. Under Contract +
//   blocker → high priority) but never overrides the user-set Category cadence.

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

// --- Pipeline category (attention intensity, user-set, never overridden by Stage) ---

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

// Outreach cadence per category, in days. Pure category-driven.
// Stage-driven escalation lives in insights.ts and is additive, not an override.
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

// --- Sequencing (Both-only) ---

export const SEQUENCING_OPTIONS: readonly Sequencing[] = [
  'sell_first',
  'buy_first',
  'parallel',
  'unknown',
] as const;

export const SEQUENCING_LABELS: Record<Sequencing, string> = {
  sell_first: 'Sell first, then buy',
  buy_first: 'Buy first, then sell',
  parallel: 'Run in parallel',
  unknown: 'Not sure yet',
};
