// Row types matching Supabase tables (snake_case).
// These are intentionally hand-written; generated types can be added later.

import type {
  Stage,
  Assignee,
  Category,
  OpportunityType,
  ContactMethod,
  DocumentType,
} from '../../types';

export interface DealRow {
  id: string;
  workspace_id: string;
  client_name: string;
  category: Category;
  opportunity_type: OpportunityType | null;
  probability: number | null;
  comments: string | null;
  stage: Stage;
  assigned_to: Assignee;
  address: string | null;
  phone: string | null;
  email: string | null;
  price: number | null;
  next_action: string | null;
  target_timeframe: string | null;
  area_of_interest: string | null;
  motivation: string | null;
  blocker: string | null;
  lead_source: string | null;
  last_contact: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ContactLogEntryRow {
  id: string;
  deal_id: string;
  timestamp: string;
  method: ContactMethod;
  author: Assignee;
  note: string;
  created_at: string;
}

export interface NoteRow {
  id: string;
  deal_id: string;
  author: Assignee;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  deal_id: string;
  title: string;
  type: DocumentType;
  author: Assignee;
  content: string;
  created_at: string;
  updated_at: string;
}

// Shape returned by the relational fetch (deals + nested children)
export interface DealRowWithChildren extends DealRow {
  contact_log_entries: ContactLogEntryRow[];
  notes: NoteRow[];
  documents: DocumentRow[];
}

export interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
}
