import { supabase } from '../lib/supabase';
import type { ContactLogEntry } from '../types';
import { contactLogEntryToInsertRow } from '../lib/mappers';

export async function addContactLogEntry(
  entry: ContactLogEntry,
  dealId: string,
): Promise<void> {
  const row = contactLogEntryToInsertRow(entry, dealId);
  const { error } = await supabase.from('contact_log_entries').insert(row);
  if (error) throw error;
}
