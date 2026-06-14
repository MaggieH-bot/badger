import { useState } from 'react';
import type { Deal } from '../../types';
import { useDeals } from '../../store/useDeals';
import { useWorkspace } from '../../store/useWorkspace';
import { useAuth } from '../../store/useAuth';
import { generateId } from '../../utils/ids';
import { uploadDocumentFile } from '../../api/documents';
import {
  isPrelistingChecklistRelevant,
  PRELISTING_CHECKLIST_TITLE,
} from '../../utils/documentTemplates/prelistingChecklist';

// 15W-35 Workstream 1: turn the Badger recommendation into action. Badger
// builds the pre-listing checklist PDF from this record's fields and drops it
// in the client's Documents. Guardrail: Badger drafts; the agent reviews and
// sends — this never sends anything.
export function PrepareChecklistButton({ deal }: { deal: Deal }) {
  const { dispatch } = useDeals();
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only offer the checklist when it fits the record (seller, pre-listing).
  if (!isPrelistingChecklistRelevant(deal)) return null;

  async function handlePrepare() {
    if (busy || !workspace) return;
    setBusy(true);
    setError(null);

    const documentId = generateId();
    const now = new Date().toISOString();
    const displayName = `Pre-Listing Checklist — ${deal.clientName}.pdf`;

    try {
      // Lazy-load the PDF library (jsPDF + its deps) only on click so it
      // stays out of the initial bundle.
      const { buildPrelistingChecklistPdf } = await import(
        '../../utils/documentTemplates/prelistingChecklistPdf'
      );
      const file = buildPrelistingChecklistPdf(deal, displayName);
      const { path } = await uploadDocumentFile(
        file,
        workspace.id,
        deal.id,
        documentId,
      );

      dispatch({
        type: 'ADD_DOCUMENT',
        dealId: deal.id,
        document: {
          id: documentId,
          title: PRELISTING_CHECKLIST_TITLE,
          type: 'other',
          author: user?.id ?? '',
          createdAt: now,
          updatedAt: now,
          content: 'Prepared by Badger from this record. Review before sending.',
          filePath: path,
          fileName: displayName,
          fileSize: file.size,
          fileMime: 'application/pdf',
        },
      });

      setFlash('Added to Documents — review before sending.');
      window.setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      console.error('[badger] prepare pre-listing checklist failed:', err);
      setError(
        err instanceof Error
          ? `Couldn't prepare it: ${err.message}`
          : "Couldn't prepare the checklist. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="badger-card-prepare">
      <button
        type="button"
        className="badger-prepare-btn"
        onClick={handlePrepare}
        disabled={busy}
      >
        {busy ? 'Preparing…' : '✦ Prepare pre-listing checklist'}
      </button>
      {flash && (
        <span className="badger-prepare-flash" role="status">
          {flash}
        </span>
      )}
      {error && <span className="badger-prepare-error">{error}</span>}
    </div>
  );
}
