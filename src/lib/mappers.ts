import type { Deal, ContactLogEntry, Note, Document } from '../types';
import type {
  DealRow,
  DealRowWithChildren,
  ContactLogEntryRow,
  NoteRow,
  DocumentRow,
} from './types/db';

// ============================================
// Row → app shape
// ============================================

export function rowToContactLogEntry(row: ContactLogEntryRow): ContactLogEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    method: row.method,
    author: row.author,
    note: row.note,
  };
}

export function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    author: row.author,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    author: row.author,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToDeal(row: DealRowWithChildren): Deal {
  // Defensive correction: ensure lastContact never trails the latest log entry's timestamp.
  // Guards against the rare case where the contact_log_entries insert succeeded but
  // the subsequent deals.last_contact UPDATE failed.
  const sortedEntries = (row.contact_log_entries ?? [])
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let lastContact = row.last_contact ?? undefined;
  if (sortedEntries.length > 0) {
    const latestEntry = sortedEntries[sortedEntries.length - 1].timestamp;
    if (!lastContact || new Date(latestEntry) > new Date(lastContact)) {
      lastContact = latestEntry;
    }
  }

  return {
    id: row.id,
    clientName: row.client_name,
    category: row.category,
    opportunityType: row.opportunity_type ?? undefined,
    probability: row.probability ?? undefined,
    comments: row.comments ?? undefined,
    stage: row.stage,
    assignedTo: row.assigned_to,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    price: row.price ?? undefined,
    nextAction: row.next_action ?? undefined,
    targetTimeframe: row.target_timeframe ?? undefined,
    areaOfInterest: row.area_of_interest ?? undefined,
    motivation: row.motivation ?? undefined,
    blocker: row.blocker ?? undefined,
    leadSource: row.lead_source ?? undefined,
    lastContact,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contactLog: sortedEntries.map(rowToContactLogEntry),
    notes: (row.notes ?? [])
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(rowToNote),
    documents: (row.documents ?? [])
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(rowToDocument),
  };
}

// ============================================
// App shape → row (insert / update)
// ============================================

type DealInsertRow = Omit<DealRow, 'created_at' | 'updated_at'>;
type DealUpdateRow = Omit<DealRow, 'id' | 'workspace_id' | 'created_at' | 'updated_at' | 'created_by'>;

export function dealToInsertRow(
  deal: Deal,
  workspaceId: string,
  userId: string | null,
): DealInsertRow {
  return {
    id: deal.id,
    workspace_id: workspaceId,
    client_name: deal.clientName,
    category: deal.category,
    opportunity_type: deal.opportunityType ?? null,
    probability: deal.probability ?? null,
    comments: deal.comments ?? null,
    stage: deal.stage,
    assigned_to: deal.assignedTo,
    address: deal.address ?? null,
    phone: deal.phone ?? null,
    email: deal.email ?? null,
    price: deal.price ?? null,
    next_action: deal.nextAction ?? null,
    target_timeframe: deal.targetTimeframe ?? null,
    area_of_interest: deal.areaOfInterest ?? null,
    motivation: deal.motivation ?? null,
    blocker: deal.blocker ?? null,
    lead_source: deal.leadSource ?? null,
    last_contact: deal.lastContact ?? null,
    created_by: userId,
  };
}

export function dealToUpdateRow(deal: Deal): DealUpdateRow {
  return {
    client_name: deal.clientName,
    category: deal.category,
    opportunity_type: deal.opportunityType ?? null,
    probability: deal.probability ?? null,
    comments: deal.comments ?? null,
    stage: deal.stage,
    assigned_to: deal.assignedTo,
    address: deal.address ?? null,
    phone: deal.phone ?? null,
    email: deal.email ?? null,
    price: deal.price ?? null,
    next_action: deal.nextAction ?? null,
    target_timeframe: deal.targetTimeframe ?? null,
    area_of_interest: deal.areaOfInterest ?? null,
    motivation: deal.motivation ?? null,
    blocker: deal.blocker ?? null,
    lead_source: deal.leadSource ?? null,
    last_contact: deal.lastContact ?? null,
  };
}

export function contactLogEntryToInsertRow(
  entry: ContactLogEntry,
  dealId: string,
): Omit<ContactLogEntryRow, 'created_at'> {
  return {
    id: entry.id,
    deal_id: dealId,
    timestamp: entry.timestamp,
    method: entry.method,
    author: entry.author,
    note: entry.note,
  };
}

export function noteToInsertRow(
  note: Note,
  dealId: string,
): Omit<NoteRow, 'created_at' | 'updated_at'> {
  return {
    id: note.id,
    deal_id: dealId,
    author: note.author,
    content: note.content,
  };
}

export function noteToUpdateRow(note: Note): Pick<NoteRow, 'author' | 'content'> {
  return {
    author: note.author,
    content: note.content,
  };
}

export function documentToInsertRow(
  doc: Document,
  dealId: string,
): Omit<DocumentRow, 'created_at' | 'updated_at'> {
  return {
    id: doc.id,
    deal_id: dealId,
    title: doc.title,
    type: doc.type,
    author: doc.author,
    content: doc.content,
  };
}

export function documentToUpdateRow(
  doc: Document,
): Pick<DocumentRow, 'title' | 'type' | 'author' | 'content'> {
  return {
    title: doc.title,
    type: doc.type,
    author: doc.author,
    content: doc.content,
  };
}
