import { useState, useEffect, useRef } from 'react';
import type { Deal } from '../../types';
import { OPPORTUNITY_TYPE_LABELS, STAGE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { displayAssignee } from '../../utils/assignee';
import { DetailsTab, type DetailsTabHandle } from './DetailsTab';
import { ActivityTab, type ActivityTabHandle } from './ActivityTab';
import { DocumentsTab } from './DocumentsTab';

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

export function DealDrawer({ dealId, onClose, initialFocus }: DealDrawerProps) {
  const { deals, dispatch } = useDeals();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [savedFlash, setSavedFlash] = useState(false);
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
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }
    onClose();
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

    dispatch({
      type: 'UPDATE_DEAL',
      deal: { ...deal, ...detailsPatch, ...moreInfoPatch },
    });

    detailsRef.current?.markSaved();
    activityRef.current?.markMoreInfoSaved();

    setSavedFlash(true);
    window.setTimeout(() => onClose(), 800);
  }

  function handleDelete() {
    if (!deal) return;
    const ok = window.confirm(
      `Delete ${deal.clientName}? This removes all contact history, notes, and documents and cannot be undone.`,
    );
    if (!ok) return;
    dispatch({ type: 'DELETE_DEAL', dealId: deal.id });
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
          const ok = window.confirm('Discard unsaved changes?');
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

            <section className="record-section danger-zone">
              <h3 className="record-section-title">Danger zone</h3>
              <div className="danger-zone-row">
                <div className="danger-zone-copy">
                  <p className="danger-zone-heading">Delete this client</p>
                  <p className="danger-zone-detail">
                    Permanently removes {deal.clientName}, including contact
                    history, notes, and documents.
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
