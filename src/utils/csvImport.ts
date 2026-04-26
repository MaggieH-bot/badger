import type {
  Deal,
  Category,
  OpportunityType,
  Stage,
  Assignee,
} from '../types';
import { generateId } from './ids';

// ============================================
// Types
// ============================================

export type FieldKey =
  | 'clientName'
  | 'category'
  | 'assignedTo'
  | 'opportunityType'
  | 'probability'
  | 'stage'
  | 'lastContact'
  | 'nextAction'
  | 'comments'
  | 'address'
  | 'phone'
  | 'email'
  | 'price'
  | 'targetTimeframe'
  | 'areaOfInterest'
  | 'motivation'
  | 'blocker'
  | 'leadSource';

export type RowStatus = 'ok' | 'warning' | 'skipped';

export interface ParsedRow {
  rowNum: number; // spreadsheet row number (1 = headers, 2 = first data row)
  status: RowStatus;
  deal: Deal | null; // null if skipped
  clientName: string; // for display, even when skipped
  warnings: string[];
  errors: string[];
}

export interface DetectedColumn {
  csvHeader: string;
  badgerField: FieldKey;
}

export interface ImportResult {
  detectedColumns: DetectedColumn[];
  unmappedHeaders: string[];
  rows: ParsedRow[];
  summary: { ok: number; warning: number; skipped: number; total: number };
  fatalError?: string; // top-level blocker (e.g. no Client Name column)
}

// ============================================
// CSV parser (state machine, handles quotes/commas/CRLF/BOM)
// ============================================

export function parseCSV(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === '')); // drop fully blank lines
}

// ============================================
// Header normalization & alias map
// ============================================

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '') // strip trailing parens
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<string, FieldKey> = {
  // clientName
  'client name': 'clientName',
  name: 'clientName',
  client: 'clientName',
  contact: 'clientName',
  'contact name': 'clientName',
  // category
  category: 'category',
  readiness: 'category',
  // assignedTo
  'assigned to': 'assignedTo',
  assigned: 'assignedTo',
  owner: 'assignedTo',
  rep: 'assignedTo',
  agent: 'assignedTo',
  assignee: 'assignedTo',
  // opportunityType
  'opportunity type': 'opportunityType',
  type: 'opportunityType',
  opportunity: 'opportunityType',
  // probability
  probability: 'probability',
  prob: 'probability',
  '%': 'probability',
  // stage
  stage: 'stage',
  status: 'stage',
  // lastContact
  'last contact': 'lastContact',
  'last contacted': 'lastContact',
  'last touch': 'lastContact',
  // nextAction
  'next action': 'nextAction',
  'next step': 'nextAction',
  next: 'nextAction',
  todo: 'nextAction',
  // comments (deliberately NOT "notes")
  comments: 'comments',
  comment: 'comments',
  remarks: 'comments',
  // address
  address: 'address',
  property: 'address',
  'property address': 'address',
  // phone
  phone: 'phone',
  'phone number': 'phone',
  cell: 'phone',
  tel: 'phone',
  // email
  email: 'email',
  'email address': 'email',
  'e mail': 'email',
  // price
  price: 'price',
  'list price': 'price',
  budget: 'price',
  // targetTimeframe
  'target timeframe': 'targetTimeframe',
  timeframe: 'targetTimeframe',
  target: 'targetTimeframe',
  // areaOfInterest
  'area of interest': 'areaOfInterest',
  area: 'areaOfInterest',
  neighborhood: 'areaOfInterest',
  // motivation
  motivation: 'motivation',
  why: 'motivation',
  reason: 'motivation',
  // blocker
  blocker: 'blocker',
  blockers: 'blocker',
  blocking: 'blocker',
  // leadSource
  'lead source': 'leadSource',
  source: 'leadSource',
  'referral source': 'leadSource',
  referral: 'leadSource',
  referrer: 'leadSource',
};

function mapHeaders(headers: string[]): {
  fieldByCol: Map<number, FieldKey>;
  detected: DetectedColumn[];
  unmapped: string[];
} {
  const fieldByCol = new Map<number, FieldKey>();
  const detected: DetectedColumn[] = [];
  const unmapped: string[] = [];
  const seenFields = new Set<FieldKey>();

  headers.forEach((raw, idx) => {
    const normalized = normalizeHeader(raw);
    const field = HEADER_ALIASES[normalized];
    if (field && !seenFields.has(field)) {
      fieldByCol.set(idx, field);
      detected.push({ csvHeader: raw, badgerField: field });
      seenFields.add(field);
    } else if (raw.trim() !== '') {
      unmapped.push(raw);
    }
  });

  return { fieldByCol, detected, unmapped };
}

// ============================================
// Value normalizers (TIGHT — no fuzzy guessing)
// ============================================

const CATEGORY_MAP: Record<string, Category> = {
  hot: 'hot',
  nurture: 'nurture',
  watch: 'watch',
};

const OPP_TYPE_MAP: Record<string, OpportunityType> = {
  buy: 'buy',
  buyer: 'buy',
  sell: 'sell',
  seller: 'sell',
  list: 'sell', // legacy CSVs: "list" means seller-side → normalize to 'sell'
  listing: 'sell', // legacy CSVs: "listing" means seller-side → normalize to 'sell'
  both: 'both',
  rent: 'rent',
  rental: 'rent',
};

// Stage map: only clear values. NO won/lost/dead/dropped.
const STAGE_MAP: Record<string, Stage> = {
  lead: 'lead',
  prospect: 'prospect',
  active: 'active',
  'under contract': 'under_contract',
  under_contract: 'under_contract',
  closing: 'closing',
  closed: 'closed',
  completed: 'closed',
  complete: 'closed',
};

const ASSIGNEE_MAP: Record<string, Assignee> = {
  you: 'You',
  tc: 'TC',
  va: 'VA',
  partner: 'Partner',
};

function normalizeText(input: string | undefined): string {
  return (input ?? '').trim();
}

function normalizeCategory(input: string): {
  value: Category | null;
  recognized: boolean;
} {
  const cleaned = input.trim().toLowerCase();
  if (cleaned === '') return { value: null, recognized: true };
  const mapped = CATEGORY_MAP[cleaned];
  if (mapped) return { value: mapped, recognized: true };
  return { value: null, recognized: false };
}

function normalizeOpportunityType(input: string): {
  value: OpportunityType | undefined;
  recognized: boolean;
} {
  const cleaned = input.trim().toLowerCase();
  if (cleaned === '') return { value: undefined, recognized: true };
  const mapped = OPP_TYPE_MAP[cleaned];
  if (mapped) return { value: mapped, recognized: true };
  return { value: undefined, recognized: false };
}

function normalizeStage(input: string): {
  value: Stage | null;
  recognized: boolean;
} {
  const cleaned = input.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  if (cleaned === '') return { value: null, recognized: true };
  const mapped = STAGE_MAP[cleaned];
  if (mapped) return { value: mapped, recognized: true };
  return { value: null, recognized: false };
}

function normalizeAssignee(input: string): {
  value: Assignee | null;
  recognized: boolean;
} {
  const cleaned = input.trim().toLowerCase();
  if (cleaned === '') return { value: null, recognized: true };
  const mapped = ASSIGNEE_MAP[cleaned];
  if (mapped) return { value: mapped, recognized: true };
  return { value: null, recognized: false };
}

function normalizeProbability(input: string): {
  value: number | undefined;
  recognized: boolean;
} {
  const cleaned = input.trim().replace(/%/g, '').replace(/,/g, '');
  if (cleaned === '') return { value: undefined, recognized: true };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { value: undefined, recognized: false };
  // Treat 0 < n < 1 as a fraction (0.75 → 75)
  const value = n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n);
  if (value < 0 || value > 100) return { value: undefined, recognized: false };
  return { value, recognized: true };
}

function normalizePrice(input: string): {
  value: number | undefined;
  recognized: boolean;
} {
  const cleaned = input.trim().replace(/[$,]/g, '');
  if (cleaned === '') return { value: undefined, recognized: true };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return { value: undefined, recognized: false };
  return { value: n, recognized: true };
}

function normalizeDate(input: string): { iso: string | null; recognized: boolean } {
  const cleaned = input.trim();
  if (cleaned === '') return { iso: null, recognized: true };
  const ms = Date.parse(cleaned);
  if (Number.isNaN(ms)) return { iso: null, recognized: false };
  return { iso: new Date(ms).toISOString(), recognized: true };
}

// ============================================
// Migration rule (mirrors dealStorage.deriveCategoryFromLegacy)
// ============================================

function deriveCategoryFromLegacy(
  stage: Stage,
  probability: number | undefined,
): Category {
  if (stage === 'under_contract' || stage === 'closing') return 'hot';
  if (typeof probability === 'number') {
    if (probability >= 80) return 'hot';
    if (probability >= 40) return 'nurture';
    if (probability < 40) return 'watch';
  }
  return 'nurture';
}

// ============================================
// Per-row parsing
// ============================================

function getRawValue(
  row: string[],
  field: FieldKey,
  fieldByCol: Map<number, FieldKey>,
): string {
  for (const [colIdx, f] of fieldByCol.entries()) {
    if (f === field) return row[colIdx] ?? '';
  }
  return '';
}

function parseRow(
  row: string[],
  rowNum: number,
  fieldByCol: Map<number, FieldKey>,
  importTime: string,
): ParsedRow {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Required: clientName
  const clientName = normalizeText(getRawValue(row, 'clientName', fieldByCol));
  if (!clientName) {
    return {
      rowNum,
      status: 'skipped',
      deal: null,
      clientName: '(no name)',
      warnings: [],
      errors: ['Client Name is required.'],
    };
  }

  // Stage (defaulted, validated)
  const stageRaw = getRawValue(row, 'stage', fieldByCol);
  const stageResult = normalizeStage(stageRaw);
  let stage: Stage;
  if (stageResult.recognized) {
    stage = stageResult.value ?? 'lead';
  } else {
    stage = 'lead';
    warnings.push(`Unrecognized Stage "${stageRaw.trim()}" → defaulted to Lead.`);
  }

  // Probability (validated)
  const probRaw = getRawValue(row, 'probability', fieldByCol);
  const probResult = normalizeProbability(probRaw);
  let probability = probResult.value;
  if (!probResult.recognized) {
    probability = undefined;
    warnings.push(`Probability "${probRaw.trim()}" is not a valid 0–100 number → omitted.`);
  }

  // Category (warn-defaulted via migration rule)
  const catRaw = getRawValue(row, 'category', fieldByCol);
  const catResult = normalizeCategory(catRaw);
  let category: Category;
  if (catResult.recognized) {
    category = catResult.value ?? deriveCategoryFromLegacy(stage, probability);
    if (!catResult.value) {
      // empty — only warn if no probability/stage hint either
      if (probability === undefined && stage !== 'under_contract' && stage !== 'closing') {
        warnings.push(`Category missing → defaulted to ${labelOf(category)}.`);
      }
    }
  } else {
    category = deriveCategoryFromLegacy(stage, probability);
    warnings.push(
      `Category "${catRaw.trim()}" not recognized → defaulted to ${labelOf(category)}. (Use Hot, Nurture, or Watch.)`,
    );
  }

  // Opportunity type
  const oppRaw = getRawValue(row, 'opportunityType', fieldByCol);
  const oppResult = normalizeOpportunityType(oppRaw);
  const opportunityType = oppResult.value;
  if (!oppResult.recognized) {
    warnings.push(
      `Opportunity Type "${oppRaw.trim()}" not recognized → omitted. (Use Buy, Sell, Both, or Rent.)`,
    );
  }

  // Assigned to
  const assRaw = getRawValue(row, 'assignedTo', fieldByCol);
  const assResult = normalizeAssignee(assRaw);
  let assignedTo: Assignee;
  if (assResult.recognized) {
    assignedTo = assResult.value ?? 'You';
  } else {
    assignedTo = 'You';
    warnings.push(
      `Assigned To "${assRaw.trim()}" not recognized → defaulted to You. (Use You, TC, VA, or Partner.)`,
    );
  }

  // Last contact — missing/blank means "never logged" (NOT auto-defaulted to import time).
  const lcRaw = getRawValue(row, 'lastContact', fieldByCol);
  const lcResult = normalizeDate(lcRaw);
  let lastContact: string | undefined;
  if (lcResult.recognized) {
    lastContact = lcResult.iso ?? undefined;
  } else {
    lastContact = undefined;
    warnings.push(
      `Last Contact "${lcRaw.trim()}" is not a recognizable date → left blank (deal will surface as never contacted).`,
    );
  }

  // Price
  const priceRaw = getRawValue(row, 'price', fieldByCol);
  const priceResult = normalizePrice(priceRaw);
  const price = priceResult.value;
  if (!priceResult.recognized) {
    warnings.push(`Price "${priceRaw.trim()}" is not a valid number → omitted.`);
  }

  // Free text fields
  const comments = normalizeText(getRawValue(row, 'comments', fieldByCol)) || undefined;
  const nextAction = normalizeText(getRawValue(row, 'nextAction', fieldByCol)) || undefined;
  const address = normalizeText(getRawValue(row, 'address', fieldByCol)) || undefined;
  const phone = normalizeText(getRawValue(row, 'phone', fieldByCol)) || undefined;
  const email = normalizeText(getRawValue(row, 'email', fieldByCol)) || undefined;
  const targetTimeframe = normalizeText(getRawValue(row, 'targetTimeframe', fieldByCol)) || undefined;
  const areaOfInterest = normalizeText(getRawValue(row, 'areaOfInterest', fieldByCol)) || undefined;
  const motivation = normalizeText(getRawValue(row, 'motivation', fieldByCol)) || undefined;
  const blocker = normalizeText(getRawValue(row, 'blocker', fieldByCol)) || undefined;
  const leadSource = normalizeText(getRawValue(row, 'leadSource', fieldByCol)) || undefined;

  const deal: Deal = {
    id: generateId(),
    clientName,
    category,
    opportunityType,
    probability,
    comments,
    stage,
    assignedTo,
    address,
    phone,
    email,
    price,
    nextAction,
    targetTimeframe,
    areaOfInterest,
    motivation,
    blocker,
    leadSource,
    lastContact,
    createdAt: importTime,
    updatedAt: importTime,
    contactLog: [],
    notes: [],
    documents: [],
  };

  return {
    rowNum,
    status: warnings.length > 0 ? 'warning' : 'ok',
    deal,
    clientName,
    warnings,
    errors,
  };
}

function labelOf(c: Category): string {
  return c === 'hot' ? 'Hot' : c === 'nurture' ? 'Nurture' : 'Watch';
}

// ============================================
// Main entry point
// ============================================

export function parseImport(text: string): ImportResult {
  const rows = parseCSV(text);
  if (rows.length === 0) {
    return {
      detectedColumns: [],
      unmappedHeaders: [],
      rows: [],
      summary: { ok: 0, warning: 0, skipped: 0, total: 0 },
      fatalError: 'The file appears to be empty.',
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const { fieldByCol, detected, unmapped } = mapHeaders(headers);

  // Top-level blocker: no Client Name column
  const hasClientName = Array.from(fieldByCol.values()).includes('clientName');
  if (!hasClientName) {
    return {
      detectedColumns: detected,
      unmappedHeaders: unmapped,
      rows: [],
      summary: { ok: 0, warning: 0, skipped: 0, total: 0 },
      fatalError:
        'No "Client Name" column detected. Use the template, or add/rename a column to "Client Name".',
    };
  }

  if (dataRows.length === 0) {
    return {
      detectedColumns: detected,
      unmappedHeaders: unmapped,
      rows: [],
      summary: { ok: 0, warning: 0, skipped: 0, total: 0 },
      fatalError: 'No data rows found below the header row.',
    };
  }

  const importTime = new Date().toISOString();
  const parsedRows = dataRows.map((row, i) => parseRow(row, i + 2, fieldByCol, importTime));

  const summary = {
    ok: parsedRows.filter((r) => r.status === 'ok').length,
    warning: parsedRows.filter((r) => r.status === 'warning').length,
    skipped: parsedRows.filter((r) => r.status === 'skipped').length,
    total: parsedRows.length,
  };

  return {
    detectedColumns: detected,
    unmappedHeaders: unmapped,
    rows: parsedRows,
    summary,
  };
}
