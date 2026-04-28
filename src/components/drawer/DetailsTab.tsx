import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
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
  onRequestSave: () => void;
}

// Imperative handle the drawer uses to drive the unified Save Changes flow.
// The drawer calls validate() first; if it passes, getPatch() returns the
// fields to merge into the UPDATE_DEAL payload and markSaved() resets the
// dirty flag. isDirty() drives the X-discard prompt.
export interface DetailsTabHandle {
  validate: () => boolean;
  getPatch: () => Partial<Deal>;
  markSaved: () => void;
  isDirty: () => boolean;
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
  };
}

export const DetailsTab = forwardRef<DetailsTabHandle, DetailsTabProps>(
  function DetailsTab({ deal, onRequestSave }, ref) {
  const { user } = useAuth();
  const { members } = useWorkspaceMembers();
  const [form, setForm] = useState(() => initForm(deal));
  const [errors, setErrors] = useState<{ clientName?: string; probability?: string }>({});
  // Tracks whether the user has typed in any field since the last save. Used
  // by the drawer footer to decide whether the X needs to confirm discard.
  const userTouchedRef = useRef(false);

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

  // Tracks whether the user just clicked Mark Done — drives the helper text
  // and lets the checkbox stay in a checked state after clearing the inputs.
  // Auto-flips back to false the moment the user types a new Next Step or
  // picks a new Due Date.
  const [markedDone, setMarkedDone] = useState(false);

  function handleChange<K extends keyof ReturnType<typeof initForm>>(
    field: K,
    value: ReturnType<typeof initForm>[K],
  ) {
    userTouchedRef.current = true;
    setForm((f) => ({ ...f, [field]: value }));
    if (errors.clientName && field === 'clientName') {
      setErrors((prev) => ({ ...prev, clientName: undefined }));
    }
    if (errors.probability && field === 'probability') {
      setErrors((prev) => ({ ...prev, probability: undefined }));
    }
    if (markedDone && (field === 'nextStep' || field === 'nextStepDue')) {
      setMarkedDone(false);
    }
  }

  // Toggling Mark Done clears Next Step + Due Date when checked; unchecking
  // leaves the cleared inputs alone (the user can simply type a new value
  // or pick a date, which also auto-unchecks via handleChange).
  function handleMarkDoneToggle() {
    if (markedDone) {
      setMarkedDone(false);
      return;
    }
    userTouchedRef.current = true;
    setForm((f) => ({ ...f, nextStep: '', nextStepDue: '' }));
    setMarkedDone(true);
  }

  const hasNextStep = form.nextStep.trim() !== '' || form.nextStepDue !== '';

  // validate() runs the form-level checks, sets error state, and returns
  // whether the form is OK to save. The drawer calls this before getPatch().
  function validate(): boolean {
    const trimmedName = form.clientName.trim();
    const newErrors: typeof errors = {};

    if (!trimmedName) newErrors.clientName = 'Client name is required.';

    const probTrim = form.probability.trim();
    if (probTrim) {
      const parsed = parseProbability(probTrim);
      if (parsed === undefined) {
        newErrors.probability = 'Probability must be an integer between 0 and 100.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // getPatch() builds the UPDATE_DEAL payload fragment for this tab's fields.
  // Caller is expected to validate() first; this assumes the form is valid.
  function getPatch(): Partial<Deal> {
    const trimmedName = form.clientName.trim();
    const probTrim = form.probability.trim();
    const parsedProbability = probTrim ? parseProbability(probTrim) : undefined;
    const dueIso = form.nextStepDue.trim()
      ? new Date(form.nextStepDue).toISOString()
      : undefined;

    return {
      clientName: trimmedName,
      category: form.category,
      opportunityType: typeOrUndef,
      probability: parsedProbability,
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
    };
  }

  useImperativeHandle(
    ref,
    () => ({
      validate,
      getPatch,
      markSaved: () => {
        userTouchedRef.current = false;
      },
      isDirty: () => userTouchedRef.current,
    }),
    // validate / getPatch are recreated each render; that's fine — the latest
    // closure is what the footer should call.
  );

  return (
    <form
      className="deal-form"
      onSubmit={(e) => {
        // Saving runs through the workspace footer's Save Changes button so
        // every editable client field commits as a single update. Enter
        // inside an input still triggers it via this onSubmit.
        e.preventDefault();
        onRequestSave();
      }}
    >
      <section id="section-overview" className="record-section">
        <h3 className="record-section-title">Overview</h3>

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

        <div id="anchor-next-step" className="next-step-block">
          <div className="form-row form-row--next-step">
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
            <div className="form-field next-step-mark">
              <span className="form-field-spacer" aria-hidden="true">&nbsp;</span>
              <label className="next-step-mark-label">
                <input
                  type="checkbox"
                  id="dt-markDone"
                  checked={markedDone}
                  disabled={!hasNextStep && !markedDone}
                  onChange={handleMarkDoneToggle}
                />
                <span>Mark Done</span>
              </label>
            </div>
          </div>
          {markedDone && (
            <p className="next-step-done-hint" role="status">
              Done. Add the next step before saving, or save blank to move this
              client to Needs Step.
            </p>
          )}
        </div>
      </section>

      <section id="section-contact" className="record-section">
        <h3 className="record-section-title">Contact</h3>

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
      </section>

      <section id="section-status" className="record-section">
        <h3 className="record-section-title">Status</h3>

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
      </section>

      <section id="section-property-price" className="record-section">
        <h3 className="record-section-title">Property / Price</h3>

        {!showAddress && !showListPrice && !showPriceRange && !showClosedPrice && (
          <p className="record-section-hint">
            Set an Opportunity Type and Stage to enter property and price details.
          </p>
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
      </section>
    </form>
  );
  },
);
