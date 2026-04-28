import { useState, type FormEvent } from 'react';
import type { Deal, OpportunityType, Sequencing } from '../../types';
import {
  STAGE_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  VALID_STAGES_BY_TYPE,
  VALID_STAGES_WITHOUT_TYPE,
  SEQUENCING_OPTIONS,
  SEQUENCING_LABELS,
} from '../../constants/pipeline';
import { useDeals } from '../../store/useDeals';
import { useAuth } from '../../store/useAuth';
import { useWorkspaceMembers } from '../../store/useWorkspaceMembers';
import { buildAssigneeOptions, normalizeAssigneeForForm } from '../../utils/assignee';
import {
  shouldShowAddress,
  shouldShowSellerPrice,
  shouldShowBuyerPriceRange,
  shouldShowClosedPrice,
} from '../deals/fieldVisibility';

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

function parseNumber(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function isoToDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function initForm(deal: Deal) {
  return {
    clientName: deal.clientName,
    category: deal.category,
    opportunityType: deal.opportunityType ?? '',
    probability: deal.probability !== undefined ? String(deal.probability) : '',
    stage: deal.stage,
    assignedTo: deal.assignedTo,
    nextStep: deal.nextStep ?? '',
    nextStepDue: isoToDateInput(deal.nextStepDue),
    address: deal.address ?? '',
    phone: deal.phone ?? '',
    email: deal.email ?? '',
    listPrice: deal.listPrice !== undefined ? String(deal.listPrice) : '',
    priceRangeLow: deal.priceRangeLow !== undefined ? String(deal.priceRangeLow) : '',
    priceRangeHigh: deal.priceRangeHigh !== undefined ? String(deal.priceRangeHigh) : '',
    closedPrice: deal.closedPrice !== undefined ? String(deal.closedPrice) : '',
    sequencing: (deal.sequencing ?? '') as Sequencing | '',
    comments: deal.comments ?? '',
  };
}

export function DetailsTab({ deal, onSaved, onDeleted, onOpenActivity }: DetailsTabProps) {
  const { dispatch } = useDeals();
  const { user } = useAuth();
  const { members } = useWorkspaceMembers();
  const [form, setForm] = useState(() => initForm(deal));
  const [errors, setErrors] = useState<{ clientName?: string; probability?: string }>({});

  const currentUserId = user?.id ?? null;
  const assigneeOptions = buildAssigneeOptions(members, currentUserId);

  // Normalize the form's stored assigned_to once members load. Legacy "You"
  // resolves to the workspace owner's UUID; other legacy / unknown values
  // resolve to "" (Unassigned). This silently migrates the form state without
  // touching the database until the user clicks Save.
  const normalizedAssigned = normalizeAssigneeForForm(form.assignedTo, members);
  if (members.length > 0 && normalizedAssigned !== form.assignedTo) {
    setForm((f) => ({ ...f, assignedTo: normalizedAssigned }));
  }

  const typeOrUndef: OpportunityType | undefined =
    (form.opportunityType as OpportunityType | '') || undefined;
  const validStages = typeOrUndef
    ? VALID_STAGES_BY_TYPE[typeOrUndef]
    : VALID_STAGES_WITHOUT_TYPE;

  // If type changes and current stage isn't valid, snap stage back to 'lead'.
  if (!validStages.includes(form.stage)) {
    setForm((f) => ({ ...f, stage: 'lead' }));
  }

  const showAddress = shouldShowAddress(typeOrUndef, form.stage);
  const showListPrice = shouldShowSellerPrice(typeOrUndef, form.stage);
  const showPriceRange = shouldShowBuyerPriceRange(typeOrUndef, form.stage);
  const showClosedPrice = shouldShowClosedPrice(form.stage);
  const showSequencing = typeOrUndef === 'both';

  function handleChange<K extends keyof ReturnType<typeof initForm>>(
    field: K,
    value: ReturnType<typeof initForm>[K],
  ) {
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

    const dueIso = form.nextStepDue.trim()
      ? new Date(form.nextStepDue).toISOString()
      : undefined;

    dispatch({
      type: 'UPDATE_DEAL',
      deal: {
        ...deal,
        clientName: trimmedName,
        category: form.category,
        opportunityType: typeOrUndef,
        probability: parsedProbability,
        comments: form.comments.trim() || undefined,
        stage: form.stage,
        assignedTo: form.assignedTo,
        nextStep: form.nextStep.trim() || undefined,
        nextStepDue: dueIso,
        address: showAddress ? (form.address.trim() || undefined) : undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        listPrice: showListPrice ? parseNumber(form.listPrice) : undefined,
        priceRangeLow: showPriceRange ? parseNumber(form.priceRangeLow) : undefined,
        priceRangeHigh: showPriceRange ? parseNumber(form.priceRangeHigh) : undefined,
        closedPrice: showClosedPrice ? parseNumber(form.closedPrice) : undefined,
        sequencing: showSequencing && form.sequencing ? form.sequencing : undefined,
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
              onChange={(e) => handleChange('category', e.target.value as typeof form.category)}
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
              onChange={(e) =>
                handleChange('opportunityType', e.target.value as OpportunityType | '')
              }
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

        {showSequencing && (
          <>
            <div className="phase-a-both-note">
              <strong>Both:</strong> Phase A uses a single workflow. Per-lane stage
              and Next Step are coming in a later update — for now, fill the lane that
              currently matters most and use Notes for the other side.
            </div>
            <div className="form-field">
              <label htmlFor="dt-sequencing">Sequencing</label>
              <select
                id="dt-sequencing"
                value={form.sequencing}
                onChange={(e) =>
                  handleChange('sequencing', e.target.value as Sequencing | '')
                }
              >
                <option value="">Select sequencing…</option>
                {SEQUENCING_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SEQUENCING_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="dt-stage">Stage *</label>
            <select
              id="dt-stage"
              value={form.stage}
              onChange={(e) => handleChange('stage', e.target.value as typeof form.stage)}
            >
              {validStages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="dt-assignedTo">Assigned To</label>
            <select
              id="dt-assignedTo"
              value={form.assignedTo}
              onChange={(e) => handleChange('assignedTo', e.target.value)}
            >
              {assigneeOptions.map((opt) => (
                <option key={opt.value || 'unassigned'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="dt-probability">Probability</label>
          <div className="form-suffix-input form-suffix-input--narrow">
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

        <h3 className="form-group-title">Next Step</h3>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="dt-nextStep">Next Step</label>
            <input
              id="dt-nextStep"
              type="text"
              placeholder="e.g. Send comps, schedule walkthrough"
              value={form.nextStep}
              onChange={(e) => handleChange('nextStep', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="dt-nextStepDue">Due</label>
            <input
              id="dt-nextStepDue"
              type="date"
              value={form.nextStepDue}
              onChange={(e) => handleChange('nextStepDue', e.target.value)}
            />
          </div>
        </div>

        <h3 className="form-group-title">Contact</h3>

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

        {(showAddress || showListPrice || showPriceRange || showClosedPrice) && (
          <h3 className="form-group-title">Property &amp; Price</h3>
        )}

        {showAddress && (
          <div className="form-field">
            <label htmlFor="dt-address">Address</label>
            <input
              id="dt-address"
              type="text"
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
            />
          </div>
        )}

        {showListPrice && (
          <div className="form-field">
            <label htmlFor="dt-listPrice">List Price</label>
            <input
              id="dt-listPrice"
              type="number"
              min="0"
              step="any"
              value={form.listPrice}
              onChange={(e) => handleChange('listPrice', e.target.value)}
            />
          </div>
        )}

        {showPriceRange && (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="dt-priceRangeLow">Price Range Min</label>
              <input
                id="dt-priceRangeLow"
                type="number"
                min="0"
                step="any"
                value={form.priceRangeLow}
                onChange={(e) => handleChange('priceRangeLow', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="dt-priceRangeHigh">Price Range Max</label>
              <input
                id="dt-priceRangeHigh"
                type="number"
                min="0"
                step="any"
                value={form.priceRangeHigh}
                onChange={(e) => handleChange('priceRangeHigh', e.target.value)}
              />
            </div>
          </div>
        )}

        {showClosedPrice && (
          <div className="form-field">
            <label htmlFor="dt-closedPrice">Closed Price</label>
            <input
              id="dt-closedPrice"
              type="number"
              min="0"
              step="any"
              value={form.closedPrice}
              onChange={(e) => handleChange('closedPrice', e.target.value)}
            />
          </div>
        )}

        <div className="form-field">
          <label htmlFor="dt-comments">Comments</label>
          <textarea
            id="dt-comments"
            className="note-textarea"
            rows={3}
            placeholder="Short context for this client — for longer entries, use Notes."
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
