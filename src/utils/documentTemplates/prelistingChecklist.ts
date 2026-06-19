import type { Deal } from '../../types';

// First Workstream-1 deliverable for 15W-35: a pre-listing checklist Badger
// builds deterministically from fields already on the record — no LLM, no
// backend. This module is the lightweight half (relevance + title) so the
// Badger Card can import it without pulling in the PDF library; the heavy
// jsPDF builder lives in ./prelistingChecklistPdf and is dynamically imported
// only when the agent clicks Prepare.

export const PRELISTING_CHECKLIST_TITLE = 'Pre-Listing Checklist';

// A pre-listing checklist only makes sense for a seller before the home is
// under contract. Sell / Both opportunities in the Lead or Listing stages
// are the pre-listing window; buyers, rentals, and closed/under-contract
// deals are out of scope. Trigger off record context, not insight copy.
export function isPrelistingChecklistRelevant(deal: Deal): boolean {
  const sellSide =
    deal.opportunityType === 'sell' || deal.opportunityType === 'both';
  const preListingStage = deal.stage === 'lead' || deal.stage === 'listing';
  return sellSide && preListingStage;
}
