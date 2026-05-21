import type { BadgerInsight, InsightPriority } from '../../types';

interface InsightPanelProps {
  insight: BadgerInsight;
  dealName?: string;
  onClick?: () => void;
  variant?: 'compact' | 'full';
  // Hide the High/Med/Low priority chip. It's a list-triage signal and adds
  // noise on a single record, so the in-record callout passes this true.
  // The priority still drives the panel's accent color via the class below.
  hidePriority?: boolean;
}

const PRIORITY_LABELS: Record<InsightPriority, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
};

export function InsightPanel({
  insight,
  dealName,
  onClick,
  variant = 'compact',
  hidePriority = false,
}: InsightPanelProps) {
  const className = [
    'insight-panel',
    `insight-panel--${variant}`,
    `insight-panel--${insight.priority}`,
    onClick ? 'insight-panel--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showHeader = !hidePriority || Boolean(dealName);

  const content = (
    <>
      {showHeader && (
        <div className="insight-panel-header">
          {!hidePriority && (
            <span className={`insight-priority insight-priority--${insight.priority}`}>
              {PRIORITY_LABELS[insight.priority]}
            </span>
          )}
          {dealName && <span className="insight-deal-name">{dealName}</span>}
        </div>
      )}
      <p className="insight-reason">{insight.reason}</p>
      {insight.suggestedTouch && (
        <p className="insight-touch">→ {insight.suggestedTouch}</p>
      )}
      {insight.suggestedValueAdd && (
        <p className="insight-valueadd">✦ {insight.suggestedValueAdd}</p>
      )}
      {insight.contextNote && (
        <p className="insight-context-note">{insight.contextNote}</p>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
