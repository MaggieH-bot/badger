// --- Stage & assignee unions ---

export type Stage =
  | 'lead'
  | 'prospect'
  | 'active'
  | 'under_contract'
  | 'closing'
  | 'closed';

export type Assignee = 'You' | 'TC' | 'VA' | 'Partner';

// --- Pipeline category (PRIMARY readiness lens) ---

export type Category = 'hot' | 'nurture' | 'watch';

export type OpportunityType = 'buy' | 'sell' | 'both' | 'rent';

// --- Follow-up (SECONDARY watchdog signal) ---

// Internal urgency value — kept for code stability
export type Urgency = 'cold' | 'warming' | 'on_track' | 'none';

// User-facing follow-up status — derived from urgency
export type FollowUpStatus = 'needs_attention' | 'on_track' | 'none';

// --- Badger Intelligence ---

export type InsightPriority = 'high' | 'medium' | 'low';

export interface BadgerInsight {
  priority: InsightPriority;
  reason: string;
  suggestedTouch: string;
  suggestedValueAdd: string;
  // Optional muted one-liner for at-a-glance recall (e.g. "Targeting Spring 2026").
  contextNote?: string;
}

// --- Other unions ---

export type ContactMethod = 'call' | 'text' | 'email' | 'in_person' | 'other';

export type DocumentType =
  | 'agreement'
  | 'disclosure'
  | 'inspection'
  | 'addendum'
  | 'correspondence'
  | 'other';

// --- Embedded entities ---

export interface ContactLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  method: ContactMethod;
  author: Assignee;
  note: string;
}

export interface Note {
  id: string;
  author: Assignee;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  content: string;
}

export interface Document {
  id: string;
  title: string;
  type: DocumentType;
  author: Assignee;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  content: string; // plain text only
}

// --- Core entity ---

export interface Deal {
  id: string;
  clientName: string;

  // Primary pipeline (readiness lens)
  category: Category;
  opportunityType?: OpportunityType;
  probability?: number;          // 0–100, integer
  comments?: string;             // short top-level pipeline context

  // Transaction lifecycle (orthogonal to category)
  stage: Stage;
  assignedTo: Assignee;

  // Contact / property
  address?: string;
  phone?: string;
  email?: string;
  price?: number;
  nextAction?: string;

  // Additional context for smarter follow-up
  targetTimeframe?: string;
  areaOfInterest?: string;
  motivation?: string;
  blocker?: string;
  leadSource?: string;

  // Timestamps
  lastContact?: string; // ISO 8601, OR undefined when never logged
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601

  // Embedded collections
  contactLog: ContactLogEntry[];
  notes: Note[];
  documents: Document[];
}

// --- Derived (never persisted) ---

export interface DealWithUrgency extends Deal {
  urgency: Urgency;                  // internal computed value
  followUpStatus: FollowUpStatus;    // user-facing mapped value
  daysSinceContact: number;          // 0 when neverContacted
  neverContacted: boolean;           // true when lastContact is undefined
}

// --- Storage shapes ---

export interface PipelineStore {
  deals: Deal[];
}

export type TeamFilter = Assignee | 'All';

export type AppRoute = '#/' | '#/pipeline' | '#/closed' | '#/import';

export type PipelineViewMode = 'table' | 'board';

export interface UIPreferencesStore {
  activeTeamFilter: TeamFilter;
  lastRoute: AppRoute;
  pipelineViewMode: PipelineViewMode;
}
