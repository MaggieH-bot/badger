import { supabase } from '../lib/supabase';
import type { Document } from '../types';
import { documentToInsertRow, documentToUpdateRow } from '../lib/mappers';

const BUCKET = 'client-documents';

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

/**
 * Delete a document row. If a file_path is provided, also remove the
 * corresponding object from Supabase Storage. Storage cleanup failures are
 * logged but do NOT block the row delete — leaving the row would prevent the
 * user from retrying, and orphan storage objects can be reaped later.
 */
export async function deleteDocument(
  docId: string,
  filePath?: string | null,
): Promise<void> {
  if (filePath) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([filePath]);
    if (storageError) {
      console.warn('[badger] storage object delete failed:', storageError);
    }
  }
  const { error } = await supabase.from('documents').delete().eq('id', docId);
  if (error) throw error;
}

/**
 * Upload a PDF for a document. The path is fully app-controlled so the
 * storage RLS policy can match workspace_id at folder level [1].
 */
export async function uploadDocumentFile(
  file: File,
  workspaceId: string,
  dealId: string,
  documentId: string,
): Promise<{ path: string }> {
  const path = `${workspaceId}/${dealId}/${documentId}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: true, // tolerate re-upload to the same path on retry
  });
  if (error) throw error;
  return { path };
}

/**
 * Generate a short-lived signed URL for viewing/downloading the file.
 * 60-second expiry: long enough to open in a new tab, short enough that the
 * URL isn't reusable indefinitely.
 */
export async function getDocumentSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60);
  if (error) throw error;
  if (!data?.signedUrl) {
    throw new Error('Could not get signed URL for document.');
  }
  return data.signedUrl;
}
