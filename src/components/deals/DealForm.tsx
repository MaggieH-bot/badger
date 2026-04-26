import { useState, type FormEvent } from 'react';
import type { Stage, Assignee, Category, OpportunityType } from '../../types';
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
import { generateId } from '../../utils/ids';

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

export function DealForm({ onClose }: DealFormProps) {
  const { dispatch } = useDeals();

  const [clientName, setClientName] = useState('');
  const [category, setCategory] = useState<Category>('nurture');
  const [opportunityType, setOpportunityType] = useState<OpportunityType | ''>('');
  const [probability, setProbability] = useState('');
  const [stage, setStage] = useState<Stage>('lead');
  const [assignedTo, setAssignedTo] = useState<Assignee>('You');
  const [nextAction, setNextAction] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [price, setPrice] = useState('');
  const [comments, setComments] = useState('');
  const [targetTimeframe, setTargetTimeframe] = useState('');
  const [areaOfInterest, setAreaOfInterest] = useState('');
  const [motivation, setMotivation] = useState('');
  const [blocker, setBlocker] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<{ clientName?: string; probability?: string }>({});

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
    const parsedPrice = price.trim() ? Number(price) : undefined;

    dispatch({
      type: 'ADD_DEAL',
      deal: {
        id: generateId(),
        clientName: trimmedName,
        category,
        opportunityType: opportunityType || undefined,
        probability: parsedProbability,
        comments: comments.trim() || undefined,
        stage,
        assignedTo,
        // lastContact intentionally omitted: missing = "never contacted".
        // Use the Log Contact action in the drawer to record the first touch.
        nextAction: nextAction.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        price: parsedPrice !== undefined && !isNaN(parsedPrice) ? parsedPrice : undefined,
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

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="df-stage">Stage *</label>
            <select
              id="df-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as Stage)}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="df-assignedTo">Assigned To *</label>
            <select
              id="df-assignedTo"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value as Assignee)}
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
          <div className="form-field">
            <label htmlFor="df-nextAction">Next Action</label>
            <input
              id="df-nextAction"
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            />
          </div>
        </div>

        <h3 className="form-group-title">Contact & Property</h3>

        <div className="form-field">
          <label htmlFor="df-address">Address</label>
          <input
            id="df-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

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

        <div className="form-field">
          <label htmlFor="df-price">Price</label>
          <input
            id="df-price"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

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
