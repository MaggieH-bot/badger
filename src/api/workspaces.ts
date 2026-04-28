import { supabase } from '../lib/supabase';
import { findPendingInviteForCurrentUser, markInviteAccepted } from './invites';

export interface Workspace {
  id: string;
  name: string;
}

const DEFAULT_WORKSPACE_NAME = 'Badger Workspace';

// Fast path: find a workspace via membership.
async function fetchWorkspaceViaMembership(userId: string): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspaces(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Supabase relational select returns the parent under the table name.
  // Shape can be a single object (FK 1:1) or an array; handle both.
  const ws = (data as { workspaces: Workspace | Workspace[] | null }).workspaces;
  if (!ws) return null;
  const flat = Array.isArray(ws) ? ws[0] : ws;
  return flat ? { id: flat.id, name: flat.name } : null;
}

// Recovery path: a user may have created a workspace but had the membership insert fail.
// Find any workspaces they created (visible via the "creators can read" RLS policy).
async function fetchOwnedWorkspace(userId: string): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('created_by', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as Workspace | null) ?? null;
}

async function fetchWorkspaceById(workspaceId: string): Promise<Workspace | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as Workspace | null) ?? null;
}

async function createWorkspace(userId: string): Promise<Workspace> {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name: DEFAULT_WORKSPACE_NAME, created_by: userId })
    .select('id, name')
    .single();

  if (error) throw error;
  return data as Workspace;
}

type MemberRole = 'owner' | 'member';

async function addMembership(
  workspaceId: string,
  userId: string,
  role: MemberRole,
  email: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      email: email ?? null,
    });

  if (error) throw error;
}

// Lazy backfill: ensure the current user's row carries their email so
// teammates can see them in dropdowns. No-op if already populated.
async function ensureMyEmailRecorded(
  workspaceId: string,
  userId: string,
  email: string,
): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .update({ email })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .is('email', null);
  if (error) {
    console.warn('[badger] could not backfill member email:', error);
  }
}

/**
 * Resolves the current user's workspace.
 *
 * Idempotent and partial-failure-safe:
 *   1. If the user is already a member of a workspace → return it (fast path).
 *   2. NEW: if a pending invite exists for the user's email → accept it,
 *      join that workspace as a member. (This is what makes Charlie land in
 *      Maggie's workspace instead of bootstrapping his own.)
 *   3. If they previously created a workspace whose membership insert failed
 *      → finish setup by adding the missing membership row.
 *   4. Otherwise → create a fresh workspace + owner membership.
 *
 * If a step's insert fails partway, the next call recovers via the same ladder.
 */
export async function ensureWorkspaceForCurrentUser(
  userId: string,
  email: string | null,
): Promise<Workspace> {
  let resolved: Workspace | null = null;

  // 1. Already a member?
  const member = await fetchWorkspaceViaMembership(userId);
  if (member) {
    resolved = member;
  }

  // 2. Pending invite for our email?
  if (!resolved && email) {
    const invite = await findPendingInviteForCurrentUser(email);
    if (invite) {
      await addMembership(invite.workspaceId, userId, 'member', email);
      try {
        await markInviteAccepted(invite.inviteId);
      } catch (err) {
        console.warn('[badger] could not mark invite accepted:', err);
      }
      resolved = await fetchWorkspaceById(invite.workspaceId);
    }
  }

  // 3. Created but missing membership? (recovery from prior partial failure)
  if (!resolved) {
    const owned = await fetchOwnedWorkspace(userId);
    if (owned) {
      await addMembership(owned.id, userId, 'owner', email);
      resolved = owned;
    }
  }

  // 4. Bootstrap fresh
  if (!resolved) {
    const created = await createWorkspace(userId);
    await addMembership(created.id, userId, 'owner', email);
    resolved = created;
  }

  // Lazy backfill for users whose row predates the email column.
  if (email) {
    await ensureMyEmailRecorded(resolved.id, userId, email);
  }
  return resolved;
}

/**
 * List members of a workspace with their email + role.
 * The `email` field is populated for members who have logged in since the
 * 2026-04-27 migration; older rows may have null until their next login
 * triggers ensureMyEmailRecorded().
 */
export interface WorkspaceMember {
  userId: string;
  role: string;
  email: string | null;
  joinedAt: string;
}

export async function listWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  // Fetch members + accepted invites in parallel. Invites carry email; members
  // may not (until each user logs in once post-migration). For each member
  // whose email column is null, fall back to the next unmatched accepted
  // invite email so the UI can show real identities immediately.
  const [memberResult, inviteResult] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('user_id, role, email, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
    supabase
      .from('workspace_invites')
      .select('email, accepted_at, created_at')
      .eq('workspace_id', workspaceId)
      .not('accepted_at', 'is', null)
      .order('created_at', { ascending: true }),
  ]);

  if (memberResult.error) throw memberResult.error;
  if (inviteResult.error) throw inviteResult.error;

  const memberRows = memberResult.data ?? [];
  const inviteRows = inviteResult.data ?? [];

  const knownEmails = new Set<string>();
  for (const m of memberRows) {
    const e = (m.email as string | null) ?? null;
    if (e) knownEmails.add(e.toLowerCase());
  }

  // Accepted invite emails not already represented by a member's email column.
  const fallbackQueue = inviteRows
    .map((i) => (i.email as string | null) ?? null)
    .filter((e): e is string => !!e && !knownEmails.has(e.toLowerCase()));

  let queueIdx = 0;
  return memberRows.map((row) => {
    let email = (row.email as string | null) ?? null;
    if (!email && queueIdx < fallbackQueue.length) {
      email = fallbackQueue[queueIdx++];
    }
    return {
      userId: row.user_id as string,
      role: row.role as string,
      email,
      joinedAt: row.created_at as string,
    };
  });
}
