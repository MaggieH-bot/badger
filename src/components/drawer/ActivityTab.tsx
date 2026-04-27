import { useState, type FormEvent } from 'react';
import type { Deal, ContactMethod, Assignee, Note as NoteType } from '../../types';
import { CONTACT_METHODS, CONTACT_METHOD_LABELS, ASSIGNEES } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { generateId } from '../../utils/ids';

interface ActivityTabProps {
  deal: Deal;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// --- Log Activity form ---

function LogActivityForm({ deal }: { deal: Deal }) {
  const { dispatch } = useDeals();
  const [method, setMethod] = useState<ContactMethod>('call');
  const [author, setAuthor] = useState<Assignee>('You');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = summary.trim();
    if (!trimmed) {
      setError('Summary is required.');
      return;
    }

    // Capture First Touch state BEFORE dispatch so the post-dispatch flash
    // message can mention the transition.
    const wasFirstTouch = !deal.lastContact;

    const now = new Date().toISOString();
    dispatch({
      type: 'ADD_CONTACT_LOG',
      dealId: deal.id,
      entry: {
        id: generateId(),
        timestamp: now,
        method,
        author,
        note: trimmed,
      },
    });

    setSummary('');
    setError('');
    setFlash(
      wasFirstTouch
        ? 'Activity logged. Client moved out of First Touch.'
        : 'Activity logged.',
    );
    window.setTimeout(() => setFlash(null), 3000);
  }

  return (
    <form className="log-form" onSubmit={handleSubmit}>
      <div className="log-form-row">
        <div className="form-field">
          <label htmlFor="cl-method">Method</label>
          <select
            id="cl-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as ContactMethod)}
          >
            {CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>
                {CONTACT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="cl-author">Author</label>
          <select
            id="cl-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value as Assignee)}
          >
            {ASSIGNEES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="cl-summary">Summary</label>
        <input
          id="cl-summary"
          type="text"
          value={summary}
          placeholder="What happened?"
          onChange={(e) => {
            setSummary(e.target.value);
            if (error) setError('');
          }}
        />
        {error && <span className="form-error">{error}</span>}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary">
          Save Activity
        </button>
        {flash && (
          <span className="form-saved-flash" role="status">
            {flash}
          </span>
        )}
      </div>
    </form>
  );
}

// --- More Info form ---

function initMoreInfo(deal: Deal) {
  return {
    targetTimeframe: deal.targetTimeframe ?? '',
    areaOfInterest: deal.areaOfInterest ?? '',
    motivation: deal.motivation ?? '',
    blocker: deal.blocker ?? '',
    leadSource: deal.leadSource ?? '',
  };
}

function MoreInfoForm({ deal }: { deal: Deal }) {
  const { dispatch } = useDeals();
  const [form, setForm] = useState(() => initMoreInfo(deal));
  const [savedFlash, setSavedFlash] = useState(false);

  const initial = initMoreInfo(deal);
  const dirty =
    form.targetTimeframe !== initial.targetTimeframe ||
    form.areaOfInterest !== initial.areaOfInterest ||
    form.motivation !== initial.motivation ||
    form.blocker !== initial.blocker ||
    form.leadSource !== initial.leadSource;

  function handleChange(field: keyof ReturnType<typeof initMoreInfo>, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (savedFlash) setSavedFlash(false);
  }

  function handleCancel() {
    setForm(initMoreInfo(deal));
    setSavedFlash(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    dispatch({
      type: 'UPDATE_DEAL',
      deal: {
        ...deal,
        targetTimeframe: form.targetTimeframe.trim() || undefined,
        areaOfInterest: form.areaOfInterest.trim() || undefined,
        motivation: form.motivation.trim() || undefined,
        blocker: form.blocker.trim() || undefined,
        leadSource: form.leadSource.trim() || undefined,
      },
    });
    setSavedFlash(true);
  }

  return (
    <form className="more-info-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="mi-targetTimeframe">Target Timeframe</label>
        <input
          id="mi-targetTimeframe"
          type="text"
          placeholder="e.g. March 2026, Spring, This summer"
          value={form.targetTimeframe}
          onChange={(e) => handleChange('targetTimeframe', e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="mi-areaOfInterest">Area of Interest</label>
        <input
          id="mi-areaOfInterest"
          type="text"
          placeholder="e.g. West Side, Lakeview"
          value={form.areaOfInterest}
          onChange={(e) => handleChange('areaOfInterest', e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="mi-motivation">Motivation</label>
        <input
          id="mi-motivation"
          type="text"
          placeholder="e.g. growing family, downsizing"
          value={form.motivation}
          onChange={(e) => handleChange('motivation', e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="mi-blocker">Blocker</label>
        <input
          id="mi-blocker"
          type="text"
          placeholder="e.g. needs to sell first, financing"
          value={form.blocker}
          onChange={(e) => handleChange('blocker', e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="mi-leadSource">Lead Source</label>
        <input
          id="mi-leadSource"
          type="text"
          placeholder="e.g. referral from Mike"
          value={form.leadSource}
          onChange={(e) => handleChange('leadSource', e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={handleCancel}
          disabled={!dirty}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={!dirty}>
          Save More Info
        </button>
        {savedFlash && !dirty && (
          <span className="form-saved-flash" role="status">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}

// --- Note Editor ---

function NoteEditor({
  dealId,
  note,
  onDone,
}: {
  dealId: string;
  note: NoteType;
  onDone: () => void;
}) {
  const { dispatch } = useDeals();
  const [content, setContent] = useState(note.content);
  const [error, setError] = useState('');

  function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Note cannot be empty.');
      return;
    }
    dispatch({
      type: 'UPDATE_NOTE',
      dealId,
      note: {
        ...note,
        content: trimmed,
        updatedAt: new Date().toISOString(),
      },
    });
    onDone();
  }

  return (
    <div className="note-editor">
      <textarea
        className="note-textarea"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          if (error) setError('');
        }}
        rows={3}
      />
      {error && <span className="form-error">{error}</span>}
      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={handleSave}>
          Save Note
        </button>
      </div>
    </div>
  );
}

// --- Add Note Form ---

function AddNoteForm({ dealId }: { dealId: string }) {
  const { dispatch } = useDeals();
  const [author, setAuthor] = useState<Assignee>('You');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Note cannot be empty.');
      return;
    }

    const now = new Date().toISOString();
    dispatch({
      type: 'ADD_NOTE',
      dealId,
      note: {
        id: generateId(),
        author,
        createdAt: now,
        updatedAt: now,
        content: trimmed,
      },
    });

    setContent('');
    setError('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
        + Add Note
      </button>
    );
  }

  return (
    <form className="note-add-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="note-author">Author</label>
        <select
          id="note-author"
          value={author}
          onChange={(e) => setAuthor(e.target.value as Assignee)}
        >
          {ASSIGNEES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="note-content">Note</label>
        <textarea
          id="note-content"
          className="note-textarea"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error) setError('');
          }}
          rows={3}
        />
        {error && <span className="form-error">{error}</span>}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save Note
        </button>
      </div>
    </form>
  );
}

// --- Note Item ---

function NoteItem({ dealId, note }: { dealId: string; note: NoteType }) {
  const { dispatch } = useDeals();
  const [editing, setEditing] = useState(false);

  function handleDelete() {
    if (window.confirm('Delete this note?')) {
      dispatch({ type: 'DELETE_NOTE', dealId, noteId: note.id });
    }
  }

  if (editing) {
    return (
      <NoteEditor dealId={dealId} note={note} onDone={() => setEditing(false)} />
    );
  }

  return (
    <div className="note-item">
      <div className="note-item-header">
        <span className="note-item-author">{note.author}</span>
        <span className="note-item-date">{formatTimestamp(note.createdAt)}</span>
        {note.updatedAt !== note.createdAt && (
          <span className="note-item-edited">(edited {formatTimestamp(note.updatedAt)})</span>
        )}
      </div>
      <p className="note-item-content">{note.content}</p>
      <div className="note-item-actions">
        <button type="button" className="btn-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="btn-link btn-link--danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

// --- Main Tab ---

export function ActivityTab({ deal }: ActivityTabProps) {
  const logEntries = [...deal.contactLog].reverse();

  return (
    <div className="drawer-tab-content">
      <section className="tab-section">
        <h3 className="tab-section-title">Log Activity</h3>
        <p className="tab-section-help">
          Records a touch with the client (call, text, email, meeting). Updates
          their last-contact date and removes them from First Touch.
        </p>
        <LogActivityForm deal={deal} />
        {logEntries.length === 0 ? (
          <p className="empty-state empty-state--spaced">No activity logged yet.</p>
        ) : (
          <div className="log-entries">
            {logEntries.map((entry) => (
              <div key={entry.id} className="log-entry">
                <div className="log-entry-header">
                  <span className="log-entry-method">
                    {CONTACT_METHOD_LABELS[entry.method]}
                  </span>
                  <span className="log-entry-author">{entry.author}</span>
                  <span className="log-entry-date">{formatTimestamp(entry.timestamp)}</span>
                </div>
                <p className="log-entry-note">{entry.note}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="tab-section">
        <h3 className="tab-section-title">More Info</h3>
        <p className="tab-section-help">
          Structured context — timeframe, area, motivation, blockers, lead source.
          Use Notes for freeform observations.
        </p>
        <MoreInfoForm deal={deal} />
      </section>

      <section className="tab-section">
        <h3 className="tab-section-title">Notes</h3>
        <p className="tab-section-help">
          Freeform observations for your own reference. <strong>Does not</strong>{' '}
          count as a contact — clients with notes but no logged activity stay in
          First Touch.
        </p>
        <AddNoteForm dealId={deal.id} />
        {deal.notes.length === 0 ? (
          <p className="empty-state">No notes yet.</p>
        ) : (
          <div className="notes-list">
            {deal.notes.map((note) => (
              <NoteItem key={note.id} dealId={deal.id} note={note} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
