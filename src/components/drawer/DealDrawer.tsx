import { useState, useEffect, useRef } from 'react';
import type { Deal } from '../../types';
import { OPPORTUNITY_TYPE_LABELS, STAGE_LABELS } from '../../constants/pipeline';
import { useAuth } from '../../store/useAuth';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { displayAssignee } from '../../utils/assignee';
import { generateId } from '../../utils/ids';
import { computeUrgency } from '../../utils/urgency';
import { computeInsight } from '../../utils/insights';
import { BadgerAvatar } from '../BadgerAvatar';
import { DetailsTab, type DetailsTabHandle } from './DetailsTab';
import { ActivityTab, type ActivityTabHandle } from './ActivityTab';
import { DocumentsTab } from './DocumentsTab';
import { PrepareChecklistButton } from './PrepareChecklistButton';

type SectionKey =
  | 'overview'
  | 'contact'
  | 'status'
  | 'property-price'
  | 'more-info'
  | 'activity'
  | 'notes'
  | 'documents';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'contact', label: 'Contact' },
  { key: 'status', label: 'Status' },
  { key: 'property-price', label: 'Property / Price' },
  { key: 'more-info', label: 'More Info' },
  { key: 'activity', label: 'Activity' },
  { key: 'notes', label: 'Notes' },
  { key: 'documents', label: 'Documents' },
];

interface DealDrawerProps {
  dealId: string;
  onClose: () => void;
  // 'next-step' scrolls the Next Step row into view on mount and focuses it.
  // Used when a Today row opens the workspace, so the user lands on the
  // editable Next Step / Due Date pair and the Mark Complete affordance.
  initialFocus?: 'next-step';
  // Jump to another record (the linked other side). Parent swaps the open deal.
  onSelectDeal: (dealId: string) => void;
  // Open the Add Client form prefilled to create + link this deal's other side.
  onAddOtherSide: (deal: Deal) => void;
  // Split a legacy 'both' record: this record becomes `thisSide` (keeps its
  // history), the opposite side is created and linked.
  onSplitBoth: (deal: Deal, thisSide: 'buy' | 'sell') => void;
}

function formatLastUpdated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DealDrawer({
  dealId,
  onClose,
  initialFocus,
  onSelectDeal,
  onAddOtherSide,
  onSplitBoth,
}: DealDrawerProps) {
  const { deals, dispatch } = useDeals();
  const { user } = useAuth();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [savedFlash, setSavedFlash] = useState(false);
  // Drives the "which side is this?" picker for the Split action.
  const [splitting, setSplitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<DetailsTabHandle>(null);
  const activityRef = useRef<ActivityTabHandle>(null);

  const deal: Deal | undefined = deals.find((d) => d.id === dealId);

  // The workspace treats the client record as one save unit: every editable
  // field across Overview / Contact / Status / Property-Price / More Info
  // commits together via Save Changes. Activity, Notes, and Documents keep
  // their own add/upload actions and don't gate the save flow.
  function isAnyDirty(): boolean {
    return (
      (detailsRef.current?.isDirty() ?? false) ||
      (activityRef.current?.isMoreInfoDirty() ?? false)
    );
  }

  // requestClose is the only close path — used by the X, Cancel, click-outside,
  // and the auto-close effects (where prompting is skipped because the deal
  // is already gone or filtered out).
  function requestClose() {
    if (isAnyDirty()) {
      const ok = window.confirm('Toss your unsaved changes?');
      if (!ok) return;
    }
    onClose();
  }

  // Navigating away from the current record (jump to linked side, add/split a
  // side) leaves any unsaved edits behind — guard with the same discard prompt.
  function leaveFor(action: () => void) {
    if (isAnyDirty()) {
      const ok = window.confirm('Toss your unsaved changes?');
      if (!ok) return;
    }
    action();
  }

  // Unified save: validate Details, merge Details + More Info patches into a
  // single UPDATE_DEAL, flash, then auto-close. If validation fails, jump to
  // the Overview section so the user sees the inline error.
  function handleSaveAll() {
    if (!deal) return;

    const detailsDirty = detailsRef.current?.isDirty() ?? false;
    const moreInfoDirty = activityRef.current?.isMoreInfoDirty() ?? false;
    if (!detailsDirty && !moreInfoDirty) {
      onClose();
      return;
    }

    const ok = detailsRef.current?.validate() ?? true;
    if (!ok) {
      jumpToSection('overview');
      return;
    }

    const detailsPatch = detailsRef.current?.getPatch() ?? {};
    const moreInfoPatch = activityRef.current?.getMoreInfoPatch() ?? {};
    const markDone = detailsRef.current?.consumeMarkDoneEvent() ?? null;

    dispatch({
      type: 'UPDATE_DEAL',
      deal: { ...deal, ...detailsPatch, ...moreInfoPatch },
    });

    // Mark Done counts as a completed touch. Reuses the existing
    // ADD_CONTACT_LOG path, which bumps last_contact and clears
    // Never-contacted / First-Touch surfaces for the record.
    if (markDone) {
      const trimmedPrior = markDone.priorNextStep.trim();
      dispatch({
        type: 'ADD_CONTACT_LOG',
        dealId: deal.id,
        entry: {
          id: generateId(),
          timestamp: new Date().toISOString(),
          method: 'other',
          author: user?.id ?? '',
          note: trimmedPrior ? `Marked done: ${trimmedPrior}` : 'Marked done',
        },
      });
    }

    detailsRef.current?.markSaved();
    activityRef.current?.markMoreInfoSaved();

    setSavedFlash(true);
    window.setTimeout(() => onClose(), 800);
  }

  function handleDelete() {
    if (!deal) return;
    const ok = window.confirm(
      `Delete ${deal.clientName}? Every touch, note, and document goes with them — no undo.`,
    );
    if (!ok) return;
    dispatch({ type: 'DELETE_DEAL', dealId: deal.id });
    onClose();
  }

  // Archive sets a stalled record aside (out of Today / Pipeline / insights)
  // without deleting it; Restore returns it. Reversible either way.
  function handleArchiveToggle() {
    if (!deal) return;
    if (deal.archived) {
      dispatch({ type: 'UNARCHIVE_DEAL', dealId: deal.id });
      onClose();
      return;
    }
    const ok = window.confirm(
      `Move ${deal.clientName} to the Den? They'll drop out of Today, Pipeline, and Badger's nudges — but stay in the Den, restorable anytime.`,
    );
    if (!ok) return;
    dispatch({ type: 'ARCHIVE_DEAL', dealId: deal.id });
    onClose();
  }

  function jumpToSection(key: SectionKey) {
    setActiveSection(key);
    const el = mainRef.current?.querySelector(`#section-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Auto-close if deal no longer exists (data-driven; no prompt).
  useEffect(() => {
    if (!deal) {
      onClose();
    }
  }, [deal, onClose]);

  // Auto-close if team filter changes and deal no longer matches.
  useEffect(() => {
    if (
      deal &&
      preferences.activeTeamFilter !== 'All' &&
      deal.assignedTo !== preferences.activeTeamFilter
    ) {
      onClose();
    }
  }, [deal, preferences.activeTeamFilter, onClose]);

  // Scroll/focus the Next Step row when the drawer is opened from a Today
  // row. The 60ms delay lets the modal mount and DetailsTab render the
  // anchor before scrollIntoView runs.
  useEffect(() => {
    if (initialFocus !== 'next-step') return;
    const t = window.setTimeout(() => {
      const anchor = document.getElementById('anchor-next-step');
      if (anchor) anchor.scrollIntoView({ behavior: 'auto', block: 'center' });
      const input = document.getElementById(
        'dt-nextStep',
      ) as HTMLInputElement | null;
      if (input) input.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [initialFocus]);

  // Click-outside (the dim overlay) closes the workspace, with the same
  // discard prompt as the X.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target as Node)
      ) {
        if (isAnyDirty()) {
          const ok = window.confirm('Toss your unsaved changes?');
          if (!ok) return;
        }
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!deal) return null;

  const isClosed = deal.stage === 'closed';
  const oppLabel = deal.opportunityType
    ? OPPORTUNITY_TYPE_LABELS[deal.opportunityType]
    : null;
  const assigneeLabel = displayAssignee(deal.assignedTo, members);
  const subtitleParts: string[] = [];
  if (oppLabel) subtitleParts.push(oppLabel);
  if (!isClosed) subtitleParts.push(STAGE_LABELS[deal.stage]);
  if (assigneeLabel) subtitleParts.push(`Assigned to ${assigneeLabel}`);

  // Deterministic Badger insight, computed from the persisted deal. Rendered
  // as a top-of-record banner below the header so it frames the whole record.
  const insight = computeInsight(computeUrgency(deal));

  // --- Linked-deal (15W-70 Phase 1) ---
  // The partner side, if this deal is linked. May be undefined if the partner
  // was deleted (DB nulls the link) before this render catches up.
  const linkedDeal = deal.linkedDealId
    ? deals.find((d) => d.id === deal.linkedDealId)
    : undefined;
  // "Add the other side" is offered on an unlinked single-sided record.
  const canAddOtherSide =
    !deal.linkedDealId &&
    (deal.opportunityType === 'buy' || deal.opportunityType === 'sell');
  // "Split into buy + sell" is offered on a legacy Both record not yet split.
  const canSplitBoth = !deal.linkedDealId && deal.opportunityType === 'both';

  return (
    <div className="workspace-overlay">
      <div className="workspace-modal" ref={modalRef}>
        <header className="workspace-header">
          <div className="workspace-header-info">
            <div className="workspace-title-row">
              <h2 className="workspace-title">{deal.clientName}</h2>
              {isClosed && (
                <span className="status-badge status-badge--closed">Closed</span>
              )}
            </div>
            {subtitleParts.length > 0 && (
              <p className="workspace-subtitle">{subtitleParts.join(' • ')}</p>
            )}
          </div>
          <button
            className="workspace-close"
            onClick={requestClose}
            type="button"
            aria-label="Close client record"
          >
            &times;
          </button>
        </header>

        {linkedDeal && (
          <div className="linked-banner">
            <span className="linked-banner-text">
              <span className="linked-banner-glyph" aria-hidden="true">↔</span>{' '}
              Linked to the{' '}
              <strong>
                {linkedDeal.opportunityType
                  ? OPPORTUNITY_TYPE_LABELS[linkedDeal.opportunityType].toLowerCase()
                  : 'other'}{' '}
                side
              </strong>
              {linkedDeal.stage !== 'closed' && (
                <> · {STAGE_LABELS[linkedDeal.stage]}</>
              )}
              {linkedDeal.stage === 'closed' && <> · Closed</>}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--nav"
              onClick={() => leaveFor(() => onSelectDeal(linkedDeal.id))}
            >
              View
            </button>
          </div>
        )}

        <div className="badger-card">
          <span className="badger-card-avatar">
            <BadgerAvatar size={22} title="Badger" />
          </span>
          <div className="badger-card-body">
            <span className="badger-card-eyebrow">Badger</span>
            <p className="badger-card-headline">{insight.headline}</p>
            {insight.reason && (
              <p className="badger-card-reason">{insight.reason}</p>
            )}
            {insight.suggestedTouch && (
              <p className="badger-card-move">
                <span className="badger-card-move-arrow">→</span>{' '}
                {insight.suggestedTouch}
              </p>
            )}
            {insight.suggestedValueAdd && (
              <p className="badger-card-valueadd">
                <span className="badger-card-valueadd-mark">✦</span>{' '}
                {insight.suggestedValueAdd}
              </p>
            )}
            {insight.contextNote && (
              <p className="badger-card-context">{insight.contextNote}</p>
            )}
            <PrepareChecklistButton deal={deal} />
          </div>
        </div>

        <div className="workspace-body">
          <nav className="workspace-nav" aria-label="Client record sections">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={
                  activeSection === s.key
                    ? 'workspace-nav-item workspace-nav-item--active'
                    : 'workspace-nav-item'
                }
                onClick={() => jumpToSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <main className="workspace-main" ref={mainRef}>
            <DetailsTab
              key={deal.id}
              ref={detailsRef}
              deal={deal}
              onRequestSave={handleSaveAll}
            />
            <ActivityTab
              key={`${deal.id}-activity`}
              ref={activityRef}
              deal={deal}
              onRequestSave={handleSaveAll}
            />
            <DocumentsTab key={`${deal.id}-docs`} deal={deal} />

            {canAddOtherSide && (
              <section className="record-section">
                <h3 className="record-section-title">The other side</h3>
                <div className="danger-zone-row">
                  <div className="danger-zone-copy">
                    <p className="danger-zone-heading">Add the other side</p>
                    <p className="danger-zone-detail">
                      {deal.clientName} also{' '}
                      {deal.opportunityType === 'buy' ? 'selling' : 'buying'}? Spin
                      up the linked{' '}
                      {deal.opportunityType === 'buy' ? 'sell' : 'buy'} side — it
                      tracks its own stage and nudges, joined to this one.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => leaveFor(() => onAddOtherSide(deal))}
                  >
                    Add the other side
                  </button>
                </div>
              </section>
            )}

            {canSplitBoth && (
              <section className="record-section">
                <h3 className="record-section-title">Split into buy + sell</h3>
                {!splitting ? (
                  <div className="danger-zone-row">
                    <div className="danger-zone-copy">
                      <p className="danger-zone-heading">
                        This is a Both client on one record
                      </p>
                      <p className="danger-zone-detail">
                        Split it into a linked buy side and sell side, each with
                        its own stage and nudges. This record keeps all its
                        history as the side you pick.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setSplitting(true)}
                    >
                      Split into buy + sell
                    </button>
                  </div>
                ) : (
                  <div className="danger-zone-row">
                    <div className="danger-zone-copy">
                      <p className="danger-zone-heading">
                        Which side is this record?
                      </p>
                      <p className="danger-zone-detail">
                        It keeps its history as the side you pick; the other side
                        is created fresh and linked.
                      </p>
                    </div>
                    <div className="linked-split-actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => leaveFor(() => onSplitBoth(deal, 'sell'))}
                      >
                        This is the sell side
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => leaveFor(() => onSplitBoth(deal, 'buy'))}
                      >
                        This is the buy side
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => setSplitting(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="record-section">
              <h3 className="record-section-title">The Den</h3>
              <div className="danger-zone-row">
                <div className="danger-zone-copy">
                  <p className="danger-zone-heading">
                    {deal.archived
                      ? 'Bring this client back'
                      : 'Move this client to the Den'}
                  </p>
                  <p className="danger-zone-detail">
                    {deal.archived
                      ? 'Pull them out of the Den and back into your active pipeline and Today list.'
                      : 'Set them aside without deleting — hidden from Today, Pipeline, and Badger nudges, kept in the Den.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleArchiveToggle}
                >
                  {deal.archived ? 'Bring Back' : 'Move to the Den'}
                </button>
              </div>
            </section>

            <section className="record-section danger-zone">
              <h3 className="record-section-title">Danger zone</h3>
              <div className="danger-zone-row">
                <div className="danger-zone-copy">
                  <p className="danger-zone-heading">Delete this client</p>
                  <p className="danger-zone-detail">
                    Wipes {deal.clientName} for good — every touch, note, and
                    document goes with them.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={handleDelete}
                >
                  Delete Client
                </button>
              </div>
            </section>
          </main>
        </div>

        <footer className="workspace-footer">
          <span className="workspace-footer-meta">
            Last updated: {formatLastUpdated(deal.updatedAt)}
          </span>
          <div className="workspace-footer-actions">
            {savedFlash && (
              <span className="form-saved-flash" role="status">
                Saved.
              </span>
            )}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveAll}
            >
              Save Changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
