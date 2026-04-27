import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Deal, Document as DocType, Assignee, DocumentType } from '../../types';
import { ASSIGNEES, DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useWorkspace } from '../../store/useWorkspace';
import { generateId } from '../../utils/ids';
import { uploadDocumentFile, getDocumentSignedUrl } from '../../api/documents';

interface DocumentsTabProps {
  deal: Deal;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

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

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Add Document Form ---

function AddDocumentForm({ dealId }: { dealId: string }) {
  const { dispatch } = useDeals();
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocumentType>('agreement');
  const [author, setAuthor] = useState<Assignee>('You');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; body?: string; file?: string }>({});
  const [flash, setFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setTitle('');
    setContent('');
    setDocType('agreement');
    setAuthor('You');
    setFile(null);
    setErrors({});
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== 'application/pdf') {
      setErrors((prev) => ({ ...prev, file: 'Only PDF files are supported.' }));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setErrors((prev) => ({ ...prev, file: 'File is larger than 25 MB.' }));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setErrors((prev) => ({ ...prev, file: undefined }));
    setFile(f);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!workspace) return;

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const newErrors: typeof errors = {};

    if (!trimmedTitle) newErrors.title = 'Name is required.';
    // Either notes OR a file is required — file-only documents are valid.
    if (!trimmedContent && !file) {
      newErrors.body = 'Add notes or attach a PDF.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setBusy(true);
    const documentId = generateId();
    const now = new Date().toISOString();

    let filePath: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let fileMime: string | undefined;

    if (file) {
      try {
        const { path } = await uploadDocumentFile(
          file,
          workspace.id,
          dealId,
          documentId,
        );
        filePath = path;
        fileName = file.name;
        fileSize = file.size;
        fileMime = file.type || 'application/pdf';
      } catch (err) {
        console.error('[badger] document upload failed:', err);
        setErrors({
          file:
            err instanceof Error
              ? `Upload failed: ${err.message}`
              : 'Upload failed.',
        });
        setBusy(false);
        return;
      }
    }

    dispatch({
      type: 'ADD_DOCUMENT',
      dealId,
      document: {
        id: documentId,
        title: trimmedTitle,
        type: docType,
        author,
        createdAt: now,
        updatedAt: now,
        content: trimmedContent || undefined,
        filePath,
        fileName,
        fileSize,
        fileMime,
      },
    });

    reset();
    setOpen(false);
    setFlash(file ? 'Document uploaded.' : 'Document saved.');
    window.setTimeout(() => setFlash(null), 3000);
  }

  if (!open) {
    return (
      <>
        <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
          + Add Document
        </button>
        {flash && (
          <span className="form-saved-flash" role="status" style={{ marginLeft: 12 }}>
            {flash}
          </span>
        )}
      </>
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
            disabled={busy}
          />
          {errors.title && <span className="form-error">{errors.title}</span>}
        </div>
        <div className="form-field">
          <label htmlFor="doc-type">Type *</label>
          <select
            id="doc-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType)}
            disabled={busy}
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
          disabled={busy}
        >
          {ASSIGNEES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="doc-file">Attach PDF</label>
        <input
          id="doc-file"
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          disabled={busy}
        />
        {file && (
          <span className="doc-file-pill">
            {file.name} · {formatFileSize(file.size)}
          </span>
        )}
        {errors.file && <span className="form-error">{errors.file}</span>}
      </div>
      <div className="form-field">
        <label htmlFor="doc-content">Notes</label>
        <textarea
          id="doc-content"
          className="note-textarea"
          value={content}
          rows={5}
          placeholder="Optional — leave blank if the file is the document."
          onChange={(e) => {
            setContent(e.target.value);
            if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }));
          }}
          disabled={busy}
        />
        {errors.body && <span className="form-error">{errors.body}</span>}
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Uploading…' : 'Save Document'}
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
  const [content, setContent] = useState(doc.content ?? '');
  const [errors, setErrors] = useState<{ title?: string }>({});

  function handleSave() {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const newErrors: typeof errors = {};

    if (!trimmedTitle) newErrors.title = 'Name is required.';

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
        content: trimmedContent || undefined,
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
        <label htmlFor={`doc-edit-content-${doc.id}`}>Notes</label>
        <textarea
          id={`doc-edit-content-${doc.id}`}
          className="note-textarea"
          value={content}
          rows={5}
          onChange={(e) => setContent(e.target.value)}
        />
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
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  function handleDelete() {
    if (window.confirm(`Delete "${doc.title}"?`)) {
      dispatch({
        type: 'DELETE_DOCUMENT',
        dealId,
        documentId: doc.id,
        filePath: doc.filePath,
      });
    }
  }

  async function handleOpen() {
    if (!doc.filePath || opening) return;
    setOpening(true);
    setOpenError(null);
    try {
      const url = await getDocumentSignedUrl(doc.filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[badger] document open failed:', err);
      setOpenError(
        err instanceof Error ? err.message : 'Could not open the file.',
      );
    } finally {
      setOpening(false);
    }
  }

  if (editing) {
    return (
      <DocumentEditor dealId={dealId} doc={doc} onDone={() => setEditing(false)} />
    );
  }

  const text = doc.content ?? '';
  const isLong = text.length > 200;
  const displayContent = isLong && !expanded ? text.slice(0, 200) + '…' : text;

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
      {doc.filePath && (
        <div className="doc-file-row">
          <span className="doc-file-pill">
            📎 {doc.fileName ?? 'attachment.pdf'}
            {doc.fileSize !== undefined && ` · ${formatFileSize(doc.fileSize)}`}
          </span>
          <button
            type="button"
            className="btn-link"
            onClick={handleOpen}
            disabled={opening}
          >
            {opening ? 'Opening…' : 'Open / Download'}
          </button>
        </div>
      )}
      {openError && <p className="form-error">{openError}</p>}
      {text && (
        <>
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
        </>
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
        <p className="tab-section-help">
          Attach a PDF (up to 25 MB) or write notes — both are optional, but at
          least one is required. Files open via a short-lived secure link.
        </p>
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
