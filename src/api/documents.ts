import { supabase } from '../lib/supabase';
import type { Document } from '../types';
import { documentToInsertRow, documentToUpdateRow } from '../lib/mappers';

export async function addDocument(doc: Document, dealId: string): Promise<void> {
  const row = documentToInsertRow(doc, dealId);
  const { error } = await supabase.from('documents').insert(row);
  if (error) throw error;
}

export async function updateDocument(doc: Document): Promise<void> {
  const row = documentToUpdateRow(doc);
  const { error } = await supabase.from('documents').update(row).eq('id', doc.id);
  if (error) throw error;
}

export async function deleteDocument(docId: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', docId);
  if (error) throw error;
}
