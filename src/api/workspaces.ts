import { supabase } from '../lib/supabase';

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

async function createWorkspace(userId: string): Promise<Workspace> {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name: DEFAULT_WORKSPACE_NAME, created_by: userId })
    .select('id, name')
    .single();

  if (error) throw error;
  return data as Workspace;
}

async function addOwnerMembership(workspaceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });

  if (error) throw error;
}

/**
 * Resolves the current user's workspace.
 *
 * Idempotent and partial-failure-safe:
 *   1. If the user is already a member of a workspace → return it (fast path).
 *   2. If not, but the user previously created a workspace whose membership insert
 *      failed → finish setup by adding the missing membership row.
 *   3. Otherwise → create a fresh workspace + owner membership.
 *
 * If step 3's membership insert fails, the workspace is left as a recoverable
 * orphan (not deleted) — the next call hits step 2 and completes setup.
 */
export async function ensureWorkspaceForCurrentUser(userId: string): Promise<Workspace> {
  // 1. Already a member?
  const member = await fetchWorkspaceViaMembership(userId);
  if (member) return member;

  // 2. Created but missing membership? (recovery from prior partial failure)
  const owned = await fetchOwnedWorkspace(userId);
  if (owned) {
    await addOwnerMembership(owned.id, userId);
    return owned;
  }

  // 3. Bootstrap fresh
  const created = await createWorkspace(userId);
  await addOwnerMembership(created.id, userId);
  return created;
}
