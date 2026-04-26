import { useState, useRef, type ChangeEvent } from 'react';
import type { ImportResult } from '../../utils/csvImport';
import { parseImport } from '../../utils/csvImport';
import { useDeals } from '../../store/useDeals';
import { useUIPreferences } from '../../store/useUIPreferences';
import { useRouter } from '../../router';

type Stage = 'choose' | 'preview' | 'done';

export function ImportView() {
  const { dispatch } = useDeals();
  const { dispatch: dispatchUI } = useUIPreferences();
  const { navigate } = useRouter();
  const [stage, setStage] = useState<Stage>('choose');
  const [fileName, setFileName] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importedCount, setImportedCount] = useState<number>(0);
  const [showAllRows, setShowAllRows] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError('');
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = parseImport(text);
      setResult(parsed);
      setStage('preview');
    } catch (err) {
      setFileError(`Could not read file: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      // Reset the input so re-selecting the same file works
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleConfirm() {
    if (!result) return;
    const dealsToImport = result.rows
      .filter((r) => r.deal !== null)
      .map((r) => r.deal!);

    if (dealsToImport.length === 0) return;

    dispatch({ type: 'ADD_DEALS', deals: dealsToImport });
    // Reset the team filter so the user can actually see what they just
    // imported. Without this, a stale 'Partner'/'You' filter silently hides
    // every record whose assignee doesn't match.
    dispatchUI({ type: 'SET_TEAM_FILTER', filter: 'All' });
    setImportedCount(dealsToImport.length);
    setStage('done');
  }

  function handleCancel() {
    setStage('choose');
    setResult(null);
    setFileName('');
    setShowAllRows(false);
  }

  function handleStartOver() {
    setStage('choose');
    setResult(null);
    setFileName('');
    setImportedCount(0);
    setShowAllRows(false);
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2>Import</h2>
      </div>

      {stage === 'choose' && (
        <ChooseStage
          onFile={handleFile}
          fileError={fileError}
          fileInputRef={fileInputRef}
        />
      )}

      {stage === 'preview' && result && (
        <PreviewStage
          fileName={fileName}
          result={result}
          showAllRows={showAllRows}
          onToggleAllRows={() => setShowAllRows((v) => !v)}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {stage === 'done' && (
        <DoneStage
          count={importedCount}
          onStartOver={handleStartOver}
          onGoToPipeline={() => navigate('#/pipeline')}
        />
      )}
    </div>
  );
}

// --- Choose source ---

function ChooseStage({
  onFile,
  fileError,
  fileInputRef,
}: {
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  fileError: string;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="import-choose">
      <p className="import-intro">
        Upload a CSV with your existing pipeline. Each row becomes a client in Badger.
      </p>

      <div className="import-section">
        <h3 className="import-section-title">Need a template?</h3>
        <p className="import-section-desc">
          The template lists the exact column headers Badger expects.
        </p>
        <div className="import-template-actions">
          <a href="/badger-template.csv" download className="btn btn--secondary">
            Download template
          </a>
          <a href="/badger-sample.csv" download className="btn btn--ghost">
            Download sample with examples
          </a>
        </div>
      </div>

      <div className="import-section">
        <h3 className="import-section-title">Upload your CSV</h3>
        <p className="import-section-desc">
          <strong>Required:</strong> Client Name. <strong>Strongly recommended:</strong> Category (Hot, Nurture, or Watch).
          Other columns are optional.
        </p>
        <label htmlFor="csv-input" className="btn btn--primary">
          Choose CSV file…
        </label>
        <input
          id="csv-input"
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="visually-hidden"
          onChange={onFile}
        />
        {fileError && <p className="form-error" style={{ marginTop: 12 }}>{fileError}</p>}
      </div>
    </div>
  );
}

// --- Preview ---

function PreviewStage({
  fileName,
  result,
  showAllRows,
  onToggleAllRows,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  result: ImportResult;
  showAllRows: boolean;
  onToggleAllRows: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const importable = result.summary.ok + result.summary.warning;
  const visibleRows = showAllRows ? result.rows : result.rows.slice(0, 10);

  return (
    <div className="import-preview">
      <p className="import-intro">
        File: <strong>{fileName}</strong>
      </p>

      {result.fatalError && (
        <div className="import-fatal">
          <p>{result.fatalError}</p>
        </div>
      )}

      {!result.fatalError && (
        <>
          <div className="import-summary">
            <div className="import-summary-item import-summary-item--ok">
              <span className="import-summary-count">{result.summary.ok}</span>
              <span className="import-summary-label">Ready</span>
            </div>
            <div className="import-summary-item import-summary-item--warning">
              <span className="import-summary-count">{result.summary.warning}</span>
              <span className="import-summary-label">With warnings</span>
            </div>
            <div className="import-summary-item import-summary-item--skipped">
              <span className="import-summary-count">{result.summary.skipped}</span>
              <span className="import-summary-label">Skipped</span>
            </div>
          </div>

          <details className="import-details">
            <summary>Detected columns ({result.detectedColumns.length})</summary>
            <ul className="import-mapping-list">
              {result.detectedColumns.map((col) => (
                <li key={col.csvHeader}>
                  <span className="import-mapping-csv">{col.csvHeader}</span>
                  <span className="import-mapping-arrow">→</span>
                  <span className="import-mapping-field">{col.badgerField}</span>
                </li>
              ))}
              {result.unmappedHeaders.map((h) => (
                <li key={h} className="import-mapping-unmapped">
                  <span className="import-mapping-csv">{h}</span>
                  <span className="import-mapping-arrow">→</span>
                  <span className="import-mapping-field">(not mapped)</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="import-rows-section">
            <h3 className="import-section-title">
              Row preview {showAllRows ? `(${result.rows.length})` : `(showing first 10 of ${result.rows.length})`}
            </h3>
            <ul className="import-rows-list">
              {visibleRows.map((row) => (
                <li key={row.rowNum} className={`import-row import-row--${row.status}`}>
                  <span className="import-row-icon">
                    {row.status === 'ok' ? '✓' : row.status === 'warning' ? '⚠' : '✗'}
                  </span>
                  <span className="import-row-num">Row {row.rowNum}</span>
                  <span className="import-row-name">{row.clientName}</span>
                  {(row.errors.length > 0 || row.warnings.length > 0) && (
                    <span className="import-row-msgs">
                      {[...row.errors, ...row.warnings].join(' · ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {result.rows.length > 10 && (
              <button type="button" className="btn-link" onClick={onToggleAllRows}>
                {showAllRows ? 'Show first 10' : `Show all ${result.rows.length}`}
              </button>
            )}
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
        {!result.fatalError && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onConfirm}
            disabled={importable === 0}
          >
            Import {importable} {importable === 1 ? 'record' : 'records'}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Done ---

function DoneStage({
  count,
  onStartOver,
  onGoToPipeline,
}: {
  count: number;
  onStartOver: () => void;
  onGoToPipeline: () => void;
}) {
  return (
    <div className="import-done">
      <p className="import-done-msg">
        ✓ Imported {count} {count === 1 ? 'client' : 'clients'}.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onStartOver}>
          Import another file
        </button>
        <button type="button" className="btn btn--primary" onClick={onGoToPipeline}>
          Go to Pipeline
        </button>
      </div>
    </div>
  );
}
