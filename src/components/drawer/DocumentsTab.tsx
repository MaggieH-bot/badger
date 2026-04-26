import { useState, type FormEvent } from 'react';
import type { Deal, Document as DocType, Assignee, DocumentType } from '../../types';
import { ASSIGNEES, DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { generateId } from '../../utils/ids';

interface DocumentsTabProps {
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

// --- Add Document Form ---

function AddDocumentForm({ dealId }: { dealId: string }) {
  const { dispatch } = useDeals();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocumentType>('agreement');
  const [author, setAuthor] = useState<Assignee>('You');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const newErrors: typeof errors = {};

    if (!trimmedTitle) newErrors.title = 'Name is required.';
    if (!trimmedContent) newErrors.content = 'Content is required.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const now = new Date().toISOString();
    dispatch({
      type: 'ADD_DOCUMENT',
      dealId,
      document: {
        id: generateId(),
        title: trimmedTitle,
        type: docType,
        author,
        createdAt: now,
        updatedAt: now,
        content: trimmedContent,
      },
    });

    setTitle('');
    setContent('');
    setDocType('agreement');
    setAuthor('You');
    setErrors({});
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
        + Add Document
      </button>
    );
  }

  return (
    <form className="doc-add-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="doc-title">Name *</label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
            }}
          />
          {errors.title && <span className="form-error">{errors.title}</span>}
        </div>
        <div className="form-field">
          <label htmlFor="doc-type">Type *</label>
          <select
            id="doc-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="doc-author">Author *</label>
        <select
          id="doc-author"
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
        <label htmlFor="doc-content">Content *</label>
        <textarea
          id="doc-content"
          className="note-textarea"
          value={content}
          rows={5}
          onChange={(e) => {
            setContent(e.target.value);
            if (errors.content) setErrors((prev) => ({ ...prev, content: undefined }));
          }}
        />
        {errors.content && <span className="form-error">{errors.content}</span>}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save Document
        </button>
      </div>
    </form>
  );
}

// --- Document Editor ---

function DocumentEditor({
  dealId,
  doc,
  onDone,
}: {
  dealId: string;
  doc: DocType;
  onDone: () => void;
}) {
  const { dispatch } = useDeals();
  const [title, setTitle] = useState(doc.title);
  const [docType, setDocType] = useState<DocumentType>(doc.type);
  const [author, setAuthor] = useState<Assignee>(doc.author);
  const [content, setContent] = useState(doc.content);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>({});

  function handleSave() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const newErrors: typeof errors = {};

    if (!trimmedTitle) newErrors.title = 'Name is required.';
    if (!trimmedContent) newErrors.content = 'Content is required.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    dispatch({
      type: 'UPDATE_DOCUMENT',
      dealId,
      document: {
        ...doc,
        title: trimmedTitle,
        type: docType,
        author,
        content: trimmedContent,
        updatedAt: new Date().toISOString(),
      },
    });
    onDone();
  }

  return (
    <div className="doc-editor">
      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`doc-edit-title-${doc.id}`}>Name *</label>
          <input
            id={`doc-edit-title-${doc.id}`}
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
            }}
          />
          {errors.title && <span className="form-error">{errors.title}</span>}
        </div>
        <div className="form-field">
          <label htmlFor={`doc-edit-type-${doc.id}`}>Type *</label>
          <select
            id={`doc-edit-type-${doc.id}`}
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label htmlFor={`doc-edit-author-${doc.id}`}>Author *</label>
        <select
          id={`doc-edit-author-${doc.id}`}
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
        <label htmlFor={`doc-edit-content-${doc.id}`}>Content *</label>
        <textarea
          id={`doc-edit-content-${doc.id}`}
          className="note-textarea"
          value={content}
          rows={5}
          onChange={(e) => {
            setContent(e.target.value);
            if (errors.content) setErrors((prev) => ({ ...prev, content: undefined }));
          }}
        />
        {errors.content && <span className="form-error">{errors.content}</span>}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}

// --- Document Item ---

function DocumentItem({ dealId, doc }: { dealId: string; doc: DocType }) {
  const { dispatch } = useDeals();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function handleDelete() {
    if (window.confirm(`Delete "${doc.title}"?`)) {
      dispatch({ type: 'DELETE_DOCUMENT', dealId, documentId: doc.id });
    }
  }

  if (editing) {
    return (
      <DocumentEditor dealId={dealId} doc={doc} onDone={() => setEditing(false)} />
    );
  }

  const isLong = doc.content.length > 200;
  const displayContent = isLong && !expanded ? doc.content.slice(0, 200) + '...' : doc.content;

  return (
    <div className="doc-item">
      <div className="doc-item-header">
        <span className="doc-item-title">{doc.title}</span>
        <span className="doc-item-type">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
      </div>
      <div className="doc-item-meta">
        <span>{doc.author}</span>
        <span>Created {formatTimestamp(doc.createdAt)}</span>
        {doc.updatedAt !== doc.createdAt && (
          <span className="note-item-edited">Edited {formatTimestamp(doc.updatedAt)}</span>
        )}
      </div>
      <div className="doc-item-content">{displayContent}</div>
      {isLong && (
        <button
          type="button"
          className="btn-link"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      <div className="doc-item-actions">
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

export function DocumentsTab({ deal }: DocumentsTabProps) {
  return (
    <div className="drawer-tab-content">
      <section className="tab-section">
        <h3 className="tab-section-title">Documents</h3>
        <AddDocumentForm dealId={deal.id} />
        {deal.documents.length === 0 ? (
          <p className="empty-state empty-state--spaced">No documents yet.</p>
        ) : (
          <div className="doc-list">
            {deal.documents.map((doc) => (
              <DocumentItem key={doc.id} dealId={deal.id} doc={doc} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
