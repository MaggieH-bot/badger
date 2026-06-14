import { jsPDF } from 'jspdf';
import type { Deal } from '../../types';
import { formatPriceFull } from '../priceRange';
import { PRELISTING_CHECKLIST_TITLE } from './prelistingChecklist';

// Heavy half of the 15W-35 pre-listing checklist: the jsPDF builder. Kept in
// its own module so the PDF library (and its html2canvas/dompurify deps) only
// load when an agent actually clicks Prepare — dynamically imported from
// PrepareChecklistButton. Generation is client-side and deterministic given
// the deal + today's date: no network, no model.

// Static checklist body. Grouped the way an agent actually works a new listing.
const CHECKLIST_SECTIONS: { heading: string; items: string[] }[] = [
  {
    heading: 'Pricing & Comparables',
    items: [
      'Pull recent comparable sales in the immediate area',
      'Review active and pending competition',
      'Agree on a list price and pricing strategy',
      'Walk the seller through the CMA',
    ],
  },
  {
    heading: 'Property Prep & Staging',
    items: [
      'Walk the home and note repairs / touch-ups',
      'Declutter and depersonalize plan',
      'Staging or styling recommendations',
      'Curb-appeal and exterior cleanup',
      'Deep-clean before photography',
    ],
  },
  {
    heading: 'Marketing & Listing',
    items: [
      'Schedule professional photography',
      'Draft listing description and feature sheet',
      'Confirm MLS entry details',
      'Plan signage, online syndication, and social',
      'Decide on open house / broker tour',
    ],
  },
  {
    heading: 'Paperwork & Disclosures',
    items: [
      'Listing agreement signed',
      'Seller disclosure forms completed',
      'Lead-based paint / required disclosures (as applicable)',
      'HOA documents gathered (if applicable)',
      'Confirm title is clear of surprises',
    ],
  },
  {
    heading: 'Showings & Communication',
    items: [
      'Agree on showing instructions and lockbox plan',
      'Set seller expectations for feedback and updates',
      'Confirm preferred contact method and cadence',
    ],
  },
];

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Build the seller "facts" rows from whatever the record actually has —
// never render an empty or "undefined" value.
function recordFacts(deal: Deal): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [
    { label: 'Client', value: deal.clientName },
  ];
  const address = deal.address?.trim();
  if (address) facts.push({ label: 'Property', value: address });
  const area = deal.areaOfInterest?.trim();
  if (area) facts.push({ label: 'Area', value: area });
  const timeframe = deal.targetTimeframe?.trim();
  if (timeframe) facts.push({ label: 'Target timeframe', value: timeframe });
  if (typeof deal.listPrice === 'number' && deal.listPrice > 0) {
    facts.push({ label: 'Target list price', value: formatPriceFull(deal.listPrice) });
  }
  facts.push({ label: 'Prepared', value: formatToday() });
  return facts;
}

/**
 * Render the pre-listing checklist to a PDF File, populated from the deal.
 * Pure given the deal + today's date — no network, no model. Letter size,
 * points unit.
 */
export function buildPrelistingChecklistPdf(deal: Deal, fileName: string): File {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56; // ~0.78"
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Page-break guard: ensure `needed` pts remain, else start a new page.
  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // --- Header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text(PRELISTING_CHECKLIST_TITLE, margin, y);
  y += 26;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text('Prepared by Badger — review before sending', margin, y);
  y += 20;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  // --- Record facts ---
  const facts = recordFacts(deal);
  doc.setFontSize(11);
  for (const fact of facts) {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    const label = `${fact.label}: `;
    doc.text(label, margin, y);
    const labelWidth = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const valueLines = doc.splitTextToSize(
      fact.value,
      contentWidth - labelWidth,
    );
    doc.text(valueLines, margin + labelWidth, y);
    y += 16 * valueLines.length;
  }
  y += 14;

  // --- Checklist sections ---
  for (const section of CHECKLIST_SECTIONS) {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(section.heading, margin, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    const box = 11; // checkbox side
    const textX = margin + box + 10;
    for (const item of section.items) {
      const lines = doc.splitTextToSize(item, contentWidth - (box + 10));
      const rowHeight = 16 * lines.length;
      ensureSpace(rowHeight + 4);
      // Empty checkbox, top-aligned with the first line of text.
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(1);
      doc.rect(margin, y - box + 2, box, box);
      doc.text(lines, textX, y);
      y += rowHeight + 6;
    }
    y += 10;
  }

  const blob = doc.output('blob');
  return new File([blob], fileName, { type: 'application/pdf' });
}
