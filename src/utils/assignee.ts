import type { WorkspaceMember } from '../api/workspaces';

// Legacy hardcoded assignee values from pre-V1 imports. Preserved for display
// only — the new dropdown does NOT offer these as selectable options.
const LEGACY_VALUES = new Set(['You', 'TC', 'VA', 'Partner']);

export function isLegacyAssignee(value: string | null | undefined): boolean {
  if (!value) return false;
  return LEGACY_VALUES.has(value);
}

export interface AssigneeOption {
  value: string;       // user_id (UUID) or empty string for Unassigned
  label: string;       // display name
  isMe?: boolean;
  isLegacy?: boolean;
}

/**
 * Build the dropdown options for Assigned To from real workspace members.
 * Always includes "Unassigned" first. Current user is labeled "You".
 * Other members show by email; if email is missing, fall back to a generic
 * "Workspace member" label.
 *
 * If `legacyValueInUse` is set (i.e., the deal currently being edited has a
 * legacy assigned_to like "Partner"), it's appended as a non-selectable
 * "(legacy)" option so the existing record renders correctly without offering
 * the value for new selection. The dropdown will show it only as the current
 * value; once changed away, it can't be re-selected.
 */
export function buildAssigneeOptions(
  members: WorkspaceMember[],
  currentUserId: string | null,
  legacyValueInUse?: string,
): AssigneeOption[] {
  const options: AssigneeOption[] = [{ value: '', label: 'Unassigned' }];

  // Sort: current user first, then alphabetical by display label.
  const sorted = [...members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
  });

  for (const m of sorted) {
    const isMe = m.userId === currentUserId;
    const label = isMe
      ? `You${m.email ? ` (${m.email})` : ''}`
      : m.email ?? 'Workspace member';
    options.push({ value: m.userId, label, isMe });
  }

  // Include the legacy value as a non-selectable display row when the deal
  // currently uses one — keeps the existing record's UI intact without
  // promoting the legacy label to a real choice for new assignments.
  if (legacyValueInUse && isLegacyAssignee(legacyValueInUse)) {
    options.push({
      value: legacyValueInUse,
      label: `${legacyValueInUse} (legacy)`,
      isLegacy: true,
    });
  }

  return options;
}

/**
 * Render an assigned_to value as a user-facing string.
 *   - empty / null → "Unassigned"
 *   - matches current user → "You"
 *   - matches another member → their email (or "Workspace member")
 *   - legacy hardcoded value → "<value>" (preserved as-is)
 *   - unknown UUID → "Workspace member" (former member, etc.)
 */
export function displayAssignee(
  value: string | null | undefined,
  members: WorkspaceMember[],
  currentUserId: string | null,
): string {
  if (!value) return 'Unassigned';
  if (isLegacyAssignee(value)) return value;
  if (value === currentUserId) return 'You';
  const match = members.find((m) => m.userId === value);
  if (match) return match.email ?? 'Workspace member';
  return 'Workspace member';
}
