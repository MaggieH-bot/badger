import { useState, type FormEvent } from 'react';
import type { Deal, OpportunityType } from '../../types';
import {
  STAGES,
  STAGE_LABELS,
  ASSIGNEES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
} from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';

interface DetailsTabProps {
  deal: Deal;
  onSaved: () => void;
  onDeleted: () => void;
  onOpenActivity: () => void;
}

function parseProbability(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 100) return undefined;
  return rounded;
}

function initForm(deal: Deal) {
  return {
    clientName: deal.clientName,
    category: deal.category,
    opportunityType: deal.opportunityType ?? '',
    probability: deal.probability !== undefined ? String(deal.probability) : '',
    stage: deal.stage,
    assignedTo: deal.assignedTo,
    nextAction: deal.nextAction ?? '',
    address: deal.address ?? '',
    phone: deal.phone ?? '',
    email: deal.email ?? '',
    price: deal.price !== undefined ? String(deal.price) : '',
    comments: deal.comments ?? '',
  };
}

export function DetailsTab({ deal, onSaved, onDeleted, onOpenActivity }: DetailsTabProps) {
  const { dispatch } = useDeals();
  const [form, setForm] = useState(() => initForm(deal));
  const [errors, setErrors] = useState<{ clientName?: string; probability?: string }>({});

  function handleChange(field: keyof ReturnType<typeof initForm>, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors.clientName && field === 'clientName') {
      setErrors((prev) => ({ ...prev, clientName: undefined }));
    }
    if (errors.probability && field === 'probability') {
      setErrors((prev) => ({ ...prev, probability: undefined }));
    }
  }

  function handleCancel() {
    setForm(initForm(deal));
    setErrors({});
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmedName = form.clientName.trim();
    const newErrors: typeof errors = {};

    if (!trimmedName) newErrors.clientName = 'Client name is required.';

    const probTrim = form.probability.trim();
    let parsedProbability: number | undefined;
    if (probTrim) {
      parsedProbability = parseProbability(probTrim);
      if (parsedProbability === undefined) {
        newErrors.probability = 'Probability must be an integer between 0 and 100.';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const parsedPrice = form.price.trim() ? Number(form.price) : undefined;

    dispatch({
      type: 'UPDATE_DEAL',
      deal: {
        ...deal,
        clientName: trimmedName,
        category: form.category,
        opportunityType: (form.opportunityType as OpportunityType | '') || undefined,
        probability: parsedProbability,
        comments: form.comments.trim() || undefined,
        stage: form.stage,
        assignedTo: form.assignedTo,
        nextAction: form.nextAction.trim() || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        price: parsedPrice !== undefined && !isNaN(parsedPrice) ? parsedPrice : undefined,
      },
    });

    onSaved();
  }

  function handleDelete() {
    const ok = window.confirm(
      `Delete ${deal.clientName}? This removes all contact history, notes, and documents and cannot be undone.`,
    );
    if (!ok) return;
    dispatch({ type: 'DELETE_DEAL', dealId: deal.id });
    onDeleted();
  }

  return (
    <div className="drawer-tab-content">
      <form className="deal-form" onSubmit={handleSubmit}>
        <h3 className="form-group-title">Identity & Pipeline</h3>

        <div className="form-field">
          <label htmlFor="dt-clientName">Client Name *</label>
          <input
            id="dt-clientName"
            type="text"
            value={form.clientName}
            onChange={(e) => handleChange('clientName', e.target.value)}
          />
          {errors.clientName && <span className="form-error">{errors.clientName}</span>}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="dt-category">Category *</label>
            <select
              id="dt-category"
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]} — {CATEGORY_DESCRIPTIONS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="dt-opportunityType">Opportunity Type</label>
            <select
              id="dt-opportunityType"
              value={form.opportunityType}
              onChange={(e) => handleChange('opportunityType', e.target.value)}
            >
              <option value="">Select type…</option>
              {OPPORTUNITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {OPPORTUNITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="dt-stage">Stage *</label>
            <select
              id="dt-stage"
              value={form.stage}
              onChange={(e) => handleChange('stage', e.target.value)}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="dt-assignedTo">Assigned To *</label>
            <select
              id="dt-assignedTo"
              value={form.assignedTo}
              onChange={(e) => handleChange('assignedTo', e.target.value)}
            >
              {ASSIGNEES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="dt-probability">Probability</label>
            <div className="form-suffix-input">
              <input
                id="dt-probability"
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.probability}
                onChange={(e) => handleChange('probability', e.target.value)}
              />
              <span className="form-suffix">%</span>
            </div>
            {errors.probability && <span className="form-error">{errors.probability}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="dt-nextAction">Next Action</label>
            <input
              id="dt-nextAction"
              type="text"
              value={form.nextAction}
              onChange={(e) => handleChange('nextAction', e.target.value)}
            />
          </div>
        </div>

        <h3 className="form-group-title">Contact & Property</h3>

        <div className="form-field">
          <label htmlFor="dt-address">Address</label>
          <input
            id="dt-address"
            type="text"
            value={form.address}
            onChange={(e) => handleChange('address', e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="dt-phone">Phone</label>
            <input
              id="dt-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="dt-email">Email</label>
            <input
              id="dt-email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="dt-price">Price</label>
          <input
            id="dt-price"
            type="number"
            min="0"
            step="any"
            value={form.price}
            onChange={(e) => handleChange('price', e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="dt-comments">Comments</label>
          <textarea
            id="dt-comments"
            className="note-textarea"
            rows={3}
            placeholder="Short context for this deal — for longer entries, use Notes."
            value={form.comments}
            onChange={(e) => handleChange('comments', e.target.value)}
          />
        </div>

        <button
          type="button"
          className="details-activity-link"
          onClick={onOpenActivity}
        >
          View Activity & More Info →
        </button>

        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>

      </form>

      <section className="danger-zone">
        <h3 className="danger-zone-title">Danger zone</h3>
        <div className="danger-zone-row">
          <div className="danger-zone-copy">
            <p className="danger-zone-heading">Delete this client</p>
            <p className="danger-zone-detail">
              Permanently removes {deal.clientName}, including contact history, notes, and documents.
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
    </div>
  );
}
