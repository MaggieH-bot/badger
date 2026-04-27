import { useState, type FormEvent } from 'react';
import type { Stage, Category, OpportunityType, Sequencing } from '../../types';
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
import { generateId } from '../../utils/ids';
import { buildAssigneeOptions } from '../../utils/assignee';
import {
  shouldShowAddress,
  shouldShowSellerPrice,
  shouldShowBuyerPriceRange,
  shouldShowClosedPrice,
} from './fieldVisibility';

interface DealFormProps {
  onClose: () => void;
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

export function DealForm({ onClose }: DealFormProps) {
  const { dispatch } = useDeals();
  const { user } = useAuth();
  const { members } = useWorkspaceMembers();
  const currentUserId = user?.id ?? null;
  const assigneeOptions = buildAssigneeOptions(members, currentUserId);

  const [clientName, setClientName] = useState('');
  const [category, setCategory] = useState<Category>('nurture');
  const [opportunityType, setOpportunityType] = useState<OpportunityType | ''>('');
  const [probability, setProbability] = useState('');
  const [stage, setStage] = useState<Stage>('lead');
  // Default to the current user so new clients are assigned to whoever is
  // creating them. Falls back to Unassigned if user.id isn't available yet.
  const [assignedTo, setAssignedTo] = useState<string>(currentUserId ?? '');
  const [nextStep, setNextStep] = useState('');
  const [nextStepDue, setNextStepDue] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [priceRangeLow, setPriceRangeLow] = useState('');
  const [priceRangeHigh, setPriceRangeHigh] = useState('');
  const [closedPrice, setClosedPrice] = useState('');
  const [sequencing, setSequencing] = useState<Sequencing | ''>('');
  const [comments, setComments] = useState('');
  const [targetTimeframe, setTargetTimeframe] = useState('');
  const [areaOfInterest, setAreaOfInterest] = useState('');
  const [motivation, setMotivation] = useState('');
  const [blocker, setBlocker] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<{ clientName?: string; probability?: string }>({});

  const typeOrUndef: OpportunityType | undefined = opportunityType || undefined;
  const validStages = typeOrUndef
    ? VALID_STAGES_BY_TYPE[typeOrUndef]
    : VALID_STAGES_WITHOUT_TYPE;
  // If type changes and current stage isn't valid for the new type, snap back to 'lead'.
  if (!validStages.includes(stage)) {
    setStage('lead');
  }

  const showAddress = shouldShowAddress(typeOrUndef, stage);
  const showListPrice = shouldShowSellerPrice(typeOrUndef, stage);
  const showPriceRange = shouldShowBuyerPriceRange(typeOrUndef, stage);
  const showClosedPrice = shouldShowClosedPrice(stage);
  const showSequencing = typeOrUndef === 'both';

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmedName = clientName.trim();
    const newErrors: typeof errors = {};

    if (!trimmedName) newErrors.clientName = 'Client name is required.';

    const probTrim = probability.trim();
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

    const now = new Date().toISOString();
    const dueIso = nextStepDue.trim() ? new Date(nextStepDue).toISOString() : undefined;

    dispatch({
      type: 'ADD_DEAL',
      deal: {
        id: generateId(),
        clientName: trimmedName,
        category,
        opportunityType: typeOrUndef,
        probability: parsedProbability,
        comments: comments.trim() || undefined,
        stage,
        assignedTo,
        // lastContact intentionally omitted: missing = "never contacted".
        nextStep: nextStep.trim() || undefined,
        nextStepDue: dueIso,
        address: showAddress ? (address.trim() || undefined) : undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        listPrice: showListPrice ? parseNumber(listPrice) : undefined,
        priceRangeLow: showPriceRange ? parseNumber(priceRangeLow) : undefined,
        priceRangeHigh: showPriceRange ? parseNumber(priceRangeHigh) : undefined,
        closedPrice: showClosedPrice ? parseNumber(closedPrice) : undefined,
        sequencing: showSequencing && sequencing ? sequencing : undefined,
        targetTimeframe: targetTimeframe.trim() || undefined,
        areaOfInterest: areaOfInterest.trim() || undefined,
        motivation: motivation.trim() || undefined,
        blocker: blocker.trim() || undefined,
        leadSource: leadSource.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        contactLog: [],
        notes: [],
        documents: [],
      },
    });

    onClose();
  }

  return (
    <div className="deal-form-container">
      <h2>Add Client</h2>
      <form className="deal-form" onSubmit={handleSubmit}>
        <h3 className="form-group-title">Identity & Pipeline</h3>

        <div className="form-field">
          <label htmlFor="df-clientName">Client Name *</label>
          <input
            id="df-clientName"
            type="text"
            value={clientName}
            onChange={(e) => {
              setClientName(e.target.value);
              clearError('clientName');
            }}
          />
          {errors.clientName && <span className="form-error">{errors.clientName}</span>}
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="df-category">Category *</label>
            <select
              id="df-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]} — {CATEGORY_DESCRIPTIONS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="df-opportunityType">Opportunity Type</label>
            <select
              id="df-opportunityType"
              value={opportunityType}
              onChange={(e) => setOpportunityType(e.target.value as OpportunityType | '')}
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
              <label htmlFor="df-sequencing">Sequencing</label>
              <select
                id="df-sequencing"
                value={sequencing}
                onChange={(e) => setSequencing(e.target.value as Sequencing | '')}
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
            <label htmlFor="df-stage">Stage *</label>
            <select
              id="df-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as Stage)}
            >
              {validStages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="df-assignedTo">Assigned To</label>
            <select
              id="df-assignedTo"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
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
          <label htmlFor="df-probability">Probability</label>
          <div className="form-suffix-input">
            <input
              id="df-probability"
              type="number"
              min="0"
              max="100"
              step="1"
              value={probability}
              onChange={(e) => {
                setProbability(e.target.value);
                clearError('probability');
              }}
            />
            <span className="form-suffix">%</span>
          </div>
          {errors.probability && <span className="form-error">{errors.probability}</span>}
        </div>

        <h3 className="form-group-title">Next Step</h3>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="df-nextStep">Next Step</label>
            <input
              id="df-nextStep"
              type="text"
              placeholder="e.g. Send comps, schedule walkthrough"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="df-nextStepDue">Due</label>
            <input
              id="df-nextStepDue"
              type="date"
              value={nextStepDue}
              onChange={(e) => setNextStepDue(e.target.value)}
            />
          </div>
        </div>

        <h3 className="form-group-title">Contact</h3>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="df-phone">Phone</label>
            <input
              id="df-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="df-email">Email</label>
            <input
              id="df-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {(showAddress || showListPrice || showPriceRange || showClosedPrice) && (
          <h3 className="form-group-title">Property &amp; Price</h3>
        )}

        {showAddress && (
          <div className="form-field">
            <label htmlFor="df-address">Address</label>
            <input
              id="df-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}

        {showListPrice && (
          <div className="form-field">
            <label htmlFor="df-listPrice">List Price</label>
            <input
              id="df-listPrice"
              type="number"
              min="0"
              step="any"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
            />
          </div>
        )}

        {showPriceRange && (
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="df-priceRangeLow">Price range — low</label>
              <input
                id="df-priceRangeLow"
                type="number"
                min="0"
                step="any"
                value={priceRangeLow}
                onChange={(e) => setPriceRangeLow(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="df-priceRangeHigh">High</label>
              <input
                id="df-priceRangeHigh"
                type="number"
                min="0"
                step="any"
                value={priceRangeHigh}
                onChange={(e) => setPriceRangeHigh(e.target.value)}
              />
            </div>
          </div>
        )}

        {showClosedPrice && (
          <div className="form-field">
            <label htmlFor="df-closedPrice">Closed Price</label>
            <input
              id="df-closedPrice"
              type="number"
              min="0"
              step="any"
              value={closedPrice}
              onChange={(e) => setClosedPrice(e.target.value)}
            />
          </div>
        )}

        <div className="form-field">
          <label htmlFor="df-comments">Comments</label>
          <textarea
            id="df-comments"
            className="note-textarea"
            rows={3}
            placeholder="Short context for this client — for longer entries, use Notes."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="form-toggle"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          {moreOpen ? '▾' : '▸'} More context
        </button>

        {moreOpen && (
          <>
            <div className="form-field">
              <label htmlFor="df-targetTimeframe">Target Timeframe</label>
              <input
                id="df-targetTimeframe"
                type="text"
                placeholder="e.g. March 2026, Spring, This summer"
                value={targetTimeframe}
                onChange={(e) => setTargetTimeframe(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="df-areaOfInterest">Area of Interest</label>
              <input
                id="df-areaOfInterest"
                type="text"
                placeholder="e.g. West Side, Lakeview"
                value={areaOfInterest}
                onChange={(e) => setAreaOfInterest(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="df-motivation">Motivation</label>
              <input
                id="df-motivation"
                type="text"
                placeholder="e.g. growing family, downsizing"
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="df-blocker">Blocker</label>
              <input
                id="df-blocker"
                type="text"
                placeholder="e.g. needs to sell first, financing"
                value={blocker}
                onChange={(e) => setBlocker(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="df-leadSource">Lead Source</label>
              <input
                id="df-leadSource"
                type="text"
                placeholder="e.g. referral from Mike"
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Create Client
          </button>
        </div>
      </form>
    </div>
  );
}
