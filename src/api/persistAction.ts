import type { DealsAction } from '../store/useDeals';
import {
  createDeal,
  bulkInsertDeals,
  updateDealRow,
  deleteDealRow,
  updateDealLastContact,
} from './deals';
import { addContactLogEntry } from './contactLog';
import { addNote, updateNote, deleteNote } from './notes';
import { addDocument, updateDocument, deleteDocument } from './documents';

/**
 * Single switch that fires the right Supabase mutation per action type.
 * Called by the dispatch wrapper in useDeals; never called for __HYDRATE__
 * (the wrapper short-circuits before reaching here).
 */
export async function persistAction(
  action: DealsAction,
  workspaceId: string,
  userId: string | null,
): Promise<void> {
  switch (action.type) {
    case '__HYDRATE__':
      // Defensive — should not be called for hydration.
      return;

    case 'ADD_DEAL':
      await createDeal(action.deal, workspaceId, userId);
      return;

    case 'ADD_DEALS':
      await bulkInsertDeals(action.deals, workspaceId, userId);
      return;

    case 'UPDATE_DEAL':
      await updateDealRow(action.deal);
      return;

    case 'DELETE_DEAL':
      await deleteDealRow(action.dealId);
      return;

    case 'ADD_CONTACT_LOG':
      await addContactLogEntry(action.entry, action.dealId);
      await updateDealLastContact(action.dealId, action.entry.timestamp);
      return;

    case 'ADD_NOTE':
      await addNote(action.note, action.dealId);
      return;

    case 'UPDATE_NOTE':
      await updateNote(action.note);
      return;

    case 'DELETE_NOTE':
      await deleteNote(action.noteId);
      return;

    case 'ADD_DOCUMENT':
      await addDocument(action.document, action.dealId);
      return;

    case 'UPDATE_DOCUMENT':
      await updateDocument(action.document);
      return;

    case 'DELETE_DOCUMENT':
      await deleteDocument(action.documentId, action.filePath ?? null);
      return;
  }
}
