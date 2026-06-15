import { jsPDF } from 'jspdf';
import type { Deal } from '../../types';

// Heavy half of the 15W-35 pre-listing deliverable: the jsPDF builder. Kept in
// its own module so the PDF library (and its html2canvas/dompurify deps) only
// load when an agent clicks Prepare — dynamically imported from
// PrepareChecklistButton. Generation is client-side and deterministic given
// the deal + today's date: no network, no model.
//
// AUDIENCE: the SELLER. This is a value-add document the agent reviews and
// SENDS to their client — not the agent's internal task list (see
// decisions-log 2026-06-14). Content synthesized from seller-prep guides.

const DOC_HEADING = 'Getting Your Home Ready to Sell';
const DOC_SUBTITLE = 'A Seller’s Guide';
const DOC_INTRO =
  'Selling your home is a big step, and a little preparation goes a long way ' +
  'toward a faster sale at a stronger price. Use this guide to get your home ' +
  'looking its best — and don’t worry, we’ll be right beside you the whole way.';

// `checklist` sections render check-off boxes (things the seller does);
// informational sections render plain bullets (what to expect / what we do).
const SECTIONS: { heading: string; checklist: boolean; items: string[] }[] = [
  {
    heading: 'Declutter & Depersonalize',
    checklist: true,
    items: [
      'Pack away family photos and personal collections so buyers can picture themselves here',
      'Clear kitchen and bathroom counters down to one or two simple items',
      'Thin out closets and cabinets by about a third to show off your storage',
      'Remove extra furniture so each room feels open and easy to walk through',
      'Box up off-season and rarely used items now — a head start on packing',
    ],
  },
  {
    heading: 'Deep Clean Top to Bottom',
    checklist: true,
    items: [
      'Clean windows inside and out to let in as much natural light as possible',
      'Wipe down baseboards, ceiling fans, light fixtures, and vents',
      'Scrub kitchen and bathroom grout, sinks, and tubs until they shine',
      'Freshen the air — replace HVAC filters and tackle any pet or cooking odors',
      'Consider professional carpet cleaning for a fresh, move-in-ready feel',
    ],
  },
  {
    heading: 'Handle Minor Repairs & Touch-Ups',
    checklist: true,
    items: [
      'Fix leaky faucets, running toilets, and squeaky or sticking doors',
      'Patch nail holes and touch up scuffs with paint',
      'Replace burned-out bulbs and cracked outlet or switch covers',
      'Re-caulk around tubs, showers, and sinks for a crisp, cared-for look',
      'A fresh coat of paint in soft, neutral tones makes rooms feel bigger',
    ],
  },
  {
    heading: 'Boost Your Curb Appeal',
    checklist: true,
    items: [
      'Mow, edge, and trim the lawn, bushes, and branches blocking windows',
      'Add fresh mulch and a few colorful potted plants near the entry',
      'Power wash the driveway, walkway, and siding',
      'Paint or wipe down the front door and add a clean welcome mat',
      'Make sure house numbers and porch lighting are clean and visible',
    ],
  },
  {
    heading: 'Stage to Show Its Best',
    checklist: true,
    items: [
      'Arrange furniture to create open walkways and inviting conversation areas',
      'Use neutral bedding, fresh towels, and a few simple accents like flowers',
      'Open blinds and curtains and turn on lamps to keep every room bright',
      'Aim for a clean, neutral look that lets your home’s best features stand out',
    ],
  },
  {
    heading: 'Gather Your Documents & Info',
    checklist: true,
    items: [
      'Collect appliance manuals, warranties, and recent service records',
      'Pull together records for the roof, HVAC, water heater, and major systems',
      'Locate permits for additions or renovations, plus a survey if you have one',
      'Gather HOA documents, dues, and property tax bills if they apply',
      'Note your home’s favorite features and recent upgrades to highlight',
    ],
  },
  {
    heading: 'Prepare for Photos & Showings',
    checklist: true,
    items: [
      'Do a full tidy and cleaning the day before professional photos',
      'Before each showing, open blinds, turn on lights, and set a comfortable temperature',
      'Empty trash cans and put away dishes, shoes, and everyday clutter',
      'Secure valuables, medications, and important paperwork',
      'Plan to take pets with you and step out so buyers can explore freely',
    ],
  },
  {
    heading: 'What to Expect Along the Way',
    checklist: false,
    items: [
      'Most homes take a few weeks of prep before they’re ready for market',
      'Showings can come on short notice, so it helps to keep things show-ready',
      'Buyer feedback is normal and useful — we’ll review it together and adjust',
      'Once an offer comes in, we’ll walk you through terms and negotiation',
      'Inspections and appraisals are routine — we’ll guide you through each one',
    ],
  },
  {
    heading: 'What We Handle for You',
    checklist: false,
    items: [
      'Pricing your home accurately using current market data',
      'Professional marketing, photography, and online exposure',
      'Scheduling and coordinating showings and open houses',
      'Negotiating offers to protect your interests and your bottom line',
      'Managing paperwork, deadlines, and the path to a smooth closing',
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

// Client-facing header facts: who it's for, the property, and the date.
// Deliberately omits internal fields (list price, timeframe) — this goes to
// the seller.
function recordFacts(deal: Deal): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [
    { label: 'Prepared for', value: deal.clientName },
  ];
  const address = deal.address?.trim();
  if (address) facts.push({ label: 'Property', value: address });
  facts.push({ label: 'Date', value: formatToday() });
  return facts;
}

/**
 * Render the seller pre-listing guide to a PDF File, populated from the deal.
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
  doc.text(DOC_HEADING, margin, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(120, 120, 120);
  doc.text(DOC_SUBTITLE, margin, y);
  y += 22;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  // --- Record facts ---
  doc.setFontSize(11);
  for (const fact of recordFacts(deal)) {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    const label = `${fact.label}: `;
    doc.text(label, margin, y);
    const labelWidth = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const valueLines = doc.splitTextToSize(fact.value, contentWidth - labelWidth);
    doc.text(valueLines, margin + labelWidth, y);
    y += 16 * valueLines.length;
  }
  y += 12;

  // --- Intro ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  const introLines = doc.splitTextToSize(DOC_INTRO, contentWidth);
  ensureSpace(15 * introLines.length);
  doc.text(introLines, margin, y);
  y += 15 * introLines.length + 16;

  // --- Sections ---
  for (const section of SECTIONS) {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text(section.heading, margin, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    const box = 11; // checkbox side / bullet column width
    const textX = margin + box + 10;
    for (const item of section.items) {
      const lines = doc.splitTextToSize(item, contentWidth - (box + 10));
      const rowHeight = 16 * lines.length;
      ensureSpace(rowHeight + 4);
      if (section.checklist) {
        // Empty check-off box, top-aligned with the first line.
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(1);
        doc.rect(margin, y - box + 2, box, box);
      } else {
        // Bullet dot for informational items.
        doc.setFillColor(120, 120, 120);
        doc.circle(margin + box / 2, y - box / 2 + 1, 1.6, 'F');
      }
      doc.text(lines, textX, y);
      y += rowHeight + 6;
    }
    y += 10;
  }

  const blob = doc.output('blob');
  return new File([blob], fileName, { type: 'application/pdf' });
}
