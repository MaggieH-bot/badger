import type { Deal, PipelineStore, Category, Stage, OpportunityType } from '../types';

const STORAGE_KEY = 'pipeline_manager_v1';

const VALID_CATEGORIES: Category[] = ['hot', 'nurture', 'watch'];

const VALID_OPPORTUNITY_TYPES: OpportunityType[] = ['buy', 'sell', 'both', 'rent'];

// Migrate legacy `opportunityType` values:
//   'list' (deprecated)   → 'sell' (canonical seller-side label)
//   anything not in the new union → undefined (safe; field is optional)
function migrateOpportunityType(raw: unknown): OpportunityType | undefined {
  if (raw === 'list') return 'sell';
  if (typeof raw === 'string' && VALID_OPPORTUNITY_TYPES.includes(raw as OpportunityType)) {
    return raw as OpportunityType;
  }
  return undefined;
}

function deriveCategoryFromLegacy(stage: Stage, probability: unknown): Category {
  // 1. Stage check first — Under Contract → Hot
  if (stage === 'under_contract') return 'hot';

  // 2. Probability-based bucketing
  if (typeof probability === 'number' && !isNaN(probability)) {
    if (probability >= 80) return 'hot';
    if (probability >= 40) return 'nurture';
    if (probability < 40) return 'watch';
  }

  // 3. Fallback for missing probability
  return 'nurture';
}

function migrateDeal(raw: Record<string, unknown>): Deal {
  const stage = raw.stage as Stage;

  // If category already valid, respect it; otherwise derive
  const category: Category = VALID_CATEGORIES.includes(raw.category as Category)
    ? (raw.category as Category)
    : deriveCategoryFromLegacy(stage, raw.probability);

  const probability =
    typeof raw.probability === 'number' && !isNaN(raw.probability)
      ? raw.probability
      : undefined;

  return {
    // Core (existing fields preserved as-is)
    id: raw.id as string,
    clientName: raw.clientName as string,
    stage,
    assignedTo: raw.assignedTo as Deal['assignedTo'],
    // lastContact is optional: pass through valid non-empty strings, otherwise undefined.
    // Existing records with auto-defaulted timestamps are preserved as-is — no rewrite.
    lastContact:
      typeof raw.lastContact === 'string' && raw.lastContact ? raw.lastContact : undefined,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,

    // Existing optional fields
    address: (raw.address as string | undefined) ?? undefined,
    phone: (raw.phone as string | undefined) ?? undefined,
    email: (raw.email as string | undefined) ?? undefined,
    price: typeof raw.price === 'number' ? raw.price : undefined,
    // Legacy localStorage records used `nextAction`; new shape uses `nextStep`.
    nextStep:
      (raw.nextStep as string | undefined) ??
      (raw.nextAction as string | undefined) ??
      undefined,

    // New primary pipeline fields
    category,
    opportunityType: migrateOpportunityType(raw.opportunityType),
    probability,
    comments: (raw.comments as string | undefined) ?? undefined,

    // New optional context fields
    targetTimeframe: (raw.targetTimeframe as string | undefined) ?? undefined,
    areaOfInterest: (raw.areaOfInterest as string | undefined) ?? undefined,
    motivation: (raw.motivation as string | undefined) ?? undefined,
    blocker: (raw.blocker as string | undefined) ?? undefined,
    leadSource: (raw.leadSource as string | undefined) ?? undefined,

    // Embedded collections (defensive defaults)
    contactLog: Array.isArray(raw.contactLog) ? (raw.contactLog as Deal['contactLog']) : [],
    notes: Array.isArray(raw.notes) ? (raw.notes as Deal['notes']) : [],
    documents: Array.isArray(raw.documents) ? (raw.documents as Deal['documents']) : [],
  };
}

export function loadDeals(): Deal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'deals' in parsed &&
      Array.isArray((parsed as PipelineStore).deals)
    ) {
      const rawDeals = (parsed as { deals: unknown[] }).deals;
      return rawDeals
        .filter(
          (d): d is Record<string, unknown> =>
            typeof d === 'object' && d !== null && 'id' in d && 'clientName' in d,
        )
        .map(migrateDeal);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveDeals(deals: Deal[]): void {
  const store: PipelineStore = { deals };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
