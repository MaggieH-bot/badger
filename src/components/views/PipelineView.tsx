import type { PipelineViewMode } from '../../types';
import { useUIPreferences } from '../../store/useUIPreferences';
import { PipelineBoardView } from './PipelineBoardView';
import { DealsTable } from './DealsTable';

interface PipelineViewProps {
  onSelectDeal: (dealId: string) => void;
}

const VIEW_MODES: { mode: PipelineViewMode; label: string }[] = [
  { mode: 'table', label: 'Table' },
  { mode: 'board', label: 'Board' },
];

export function PipelineView({ onSelectDeal }: PipelineViewProps) {
  const { preferences, dispatch } = useUIPreferences();
  const mode = preferences.pipelineViewMode;

  return (
    <div className="view">
      <div className="view-header">
        <h2>Pipeline</h2>
        <div className="view-toggle" role="tablist" aria-label="Pipeline view mode">
          {VIEW_MODES.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              role="tab"
              aria-selected={mode === opt.mode}
              className={`view-toggle-btn${mode === opt.mode ? ' view-toggle-btn--active' : ''}`}
              onClick={() =>
                dispatch({ type: 'SET_PIPELINE_VIEW_MODE', mode: opt.mode })
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'table' ? (
        <DealsTable mode="pipeline" onSelectDeal={onSelectDeal} />
      ) : (
        <PipelineBoardView onSelectDeal={onSelectDeal} />
      )}
    </div>
  );
}
