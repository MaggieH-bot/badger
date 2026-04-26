import { supabase } from '../lib/supabase';
import type { Note } from '../types';
import { noteToInsertRow, noteToUpdateRow } from '../lib/mappers';

export async function addNote(note: Note, dealId: string): Promise<void> {
  const row = noteToInsertRow(note, dealId);
  const { error } = await supabase.from('notes').insert(row);
  if (error) throw error;
}

export async function updateNote(note: Note): Promise<void> {
  const row = noteToUpdateRow(note);
  const { error } = await supabase.from('notes').update(row).eq('id', note.id);
  if (error) throw error;
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', noteId);
  if (error) throw error;
}
