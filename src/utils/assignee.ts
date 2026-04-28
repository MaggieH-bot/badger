import type { WorkspaceMember } from '../api/workspaces';

// Pre-V1 hardcoded assignee values from old imports. We never offer these in
// the dropdown. For display, "You" maps to the workspace owner; everything
// else maps to Unassigned.
const LEGACY_VALUES = new Set(['You', 'Partner', 'TC', 'VA', 'Workspace member']);

function isLegacy(value: string | null | undefined): boolean {
  if (!value) return false;
  return LEGACY_VALUES.has(value);
}

export interface AssigneeOption {
  value: string;       // user_id (UUID) or empty string for Unassigned
  label: string;       // display label (email, since we don't have name fields)
}

function memberLabel(m: WorkspaceMember): string | null {
  return m.email && m.email.trim() ? m.email : null;
}

function workspaceOwner(members: WorkspaceMember[]): WorkspaceMember | undefined {
  return members.find((m) => m.role === 'owner');
}

/**
 * Dropdown options for Assigned To (and Author / Team filter where applicable).
 * Returns Unassigned + every workspace member that has an email we can show.
 * Members whose email we can't determine are excluded from the dropdown so we
 * never render "Workspace member" or other placeholder text.
 */
export function buildAssigneeOptions(
  members: WorkspaceMember[],
  currentUserId: string | null,
): AssigneeOption[] {
  const sorted = [...members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
  });

  const options: AssigneeOption[] = [{ value: '', label: 'Unassigned' }];
  for (const m of sorted) {
    const label = memberLabel(m);
    if (!label) continue; // skip members we can't identify
    options.push({ value: m.userId, label });
  }
  return options;
}

/**
 * Convert a stored assigned_to value into a user-facing string.
 *   - empty / null      → "Unassigned"
 *   - matches a real    → that member's email
 *     workspace member
 *   - legacy "You"      → workspace owner's email (since "You" was the import-
 *                         time default and meant the original creator)
 *   - any other legacy  → "Unassigned"
 *   - unknown UUID      → "Unassigned"
 */
export function displayAssignee(
  value: string | null | undefined,
  members: WorkspaceMember[],
): string {
  if (!value) return 'Unassigned';

  // Legacy "You" → workspace owner.
  if (value === 'You') {
    const owner = workspaceOwner(members);
    return owner ? memberLabel(owner) ?? 'Unassigned' : 'Unassigned';
  }

  // Other legacy strings → unmapped.
  if (isLegacy(value)) return 'Unassigned';

  // Real member match.
  const match = members.find((m) => m.userId === value);
  if (match) return memberLabel(match) ?? 'Unassigned';

  // Unknown UUID (former member, etc.) → unmapped.
  return 'Unassigned';
}

/**
 * Convert a stored value into the form-state value the dropdown can pre-select.
 *   - "You" legacy   → workspace owner's user_id (so the dropdown highlights
 *                      the owner; saving persists the UUID and replaces "You"
 *                      in storage)
 *   - other legacy   → "" (Unassigned)
 *   - real UUID we   → as-is
 *     can identify
 *   - unknown UUID   → "" (Unassigned)
 *   - empty / null   → ""
 */
export function normalizeAssigneeForForm(
  value: string | null | undefined,
  members: WorkspaceMember[],
): string {
  if (!value) return '';
  if (value === 'You') {
    const owner = workspaceOwner(members);
    return owner && memberLabel(owner) ? owner.userId : '';
  }
  if (isLegacy(value)) return '';
  // If we have a member with this UUID and we can show their email, keep it.
  const match = members.find((m) => m.userId === value);
  if (match && memberLabel(match)) return match.userId;
  return '';
}
