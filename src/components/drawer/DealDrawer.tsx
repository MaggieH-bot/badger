import { useState, useEffect, useRef } from 'react';
import type { Deal } from '../../types';
import { STAGE_LABELS, CATEGORY_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { computeUrgency } from '../../utils/urgency';
import { computeInsight } from '../../utils/insights';
import { displayAssignee } from '../../utils/assignee';
import { InsightPanel } from '../intelligence/InsightPanel';
import { DetailsTab } from './DetailsTab';
import { ActivityTab } from './ActivityTab';
import { DocumentsTab } from './DocumentsTab';

type DrawerTab = 'details' | 'activity' | 'documents';

const TABS: { key: DrawerTab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'activity', label: 'Activity' },
  { key: 'documents', label: 'Documents' },
];

interface DealDrawerProps {
  dealId: string;
  onClose: () => void;
}

function formatLastContact(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DealDrawer({ dealId, onClose }: DealDrawerProps) {
  const { deals } = useDeals();
  const { preferences } = useUIPreferences();
  const { members } = useWorkspaceMembers();
  const [activeTab, setActiveTab] = useState<DrawerTab>('details');
  const drawerRef = useRef<HTMLDivElement>(null);

  const deal: Deal | undefined = deals.find((d) => d.id === dealId);

  // Auto-close if deal no longer exists
  useEffect(() => {
    if (!deal) {
      onClose();
    }
  }, [deal, onClose]);

  // Auto-close if team filter changes and deal no longer matches
  useEffect(() => {
    if (
      deal &&
      preferences.activeTeamFilter !== 'All' &&
      deal.assignedTo !== preferences.activeTeamFilter
    ) {
      onClose();
    }
  }, [deal, preferences.activeTeamFilter, onClose]);

  // Click-outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!deal) return null;

  const withUrgency = computeUrgency(deal);
  const daysLabel =
    withUrgency.daysSinceContact === 0
      ? 'today'
      : withUrgency.daysSinceContact === 1
        ? '1 day ago'
        : `${withUrgency.daysSinceContact} days ago`;
  const lastContactDisplay = withUrgency.neverContacted
    ? 'Last contact: never logged'
    : `Last contact: ${formatLastContact(deal.lastContact!)} (${daysLabel})`;

  return (
    <div className="drawer-overlay">
      <div className="drawer" ref={drawerRef}>
        <div className="drawer-header">
          <div className="drawer-header-info">
            <h2 className="drawer-title">{deal.clientName}</h2>
            {deal.address && (
              <p className="drawer-subtitle">{deal.address}</p>
            )}
          </div>
          <button
            className="drawer-close"
            onClick={onClose}
            type="button"
            aria-label="Close drawer"
          >
            &times;
          </button>
        </div>

        <div className="drawer-summary">
          <span className={`category-badge category-badge--${deal.category}`}>
            {CATEGORY_LABELS[deal.category]}
          </span>
          <span className="drawer-summary-item">
            {STAGE_LABELS[deal.stage]}
          </span>
          <span className="drawer-summary-item">
            {displayAssignee(deal.assignedTo, members)}
          </span>
          <span className="drawer-summary-item">{lastContactDisplay}</span>
        </div>

        {deal.stage !== 'closed' && (
          <div className="drawer-insight">
            <InsightPanel insight={computeInsight(withUrgency)} variant="compact" />
          </div>
        )}

        <div className="drawer-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`drawer-tab${activeTab === tab.key ? ' drawer-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {activeTab === 'details' && (
            <DetailsTab
              key={deal.id}
              deal={deal}
              onSaved={onClose}
              onDeleted={onClose}
              onOpenActivity={() => setActiveTab('activity')}
            />
          )}
          {activeTab === 'activity' && <ActivityTab key={deal.id} deal={deal} />}
          {activeTab === 'documents' && <DocumentsTab key={deal.id} deal={deal} />}
        </div>

        <div className="drawer-footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
