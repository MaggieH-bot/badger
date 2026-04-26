import { supabase } from '../lib/supabase';

export interface PendingInviteForUser {
  inviteId: string;
  workspaceId: string;
}

export interface SentInvite {
  id: string;
  email: string;
  createdAt: string;
  accepted: boolean;
}

/**
 * Find the oldest pending invite addressed to the current user's email.
 * Returns null when none exist.
 */
export async function findPendingInviteForCurrentUser(
  email: string,
): Promise<PendingInviteForUser | null> {
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id')
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { inviteId: data.id, workspaceId: data.workspace_id };
}

/** Audit-mark the invite as accepted. */
export async function markInviteAccepted(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}

/** All invites sent for a workspace, newest first. */
export async function listInvitesForWorkspace(workspaceId: string): Promise<SentInvite[]> {
  const { data, error } = await supabase
    .from('workspace_invites')
    .select('id, email, created_at, accepted_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    createdAt: row.created_at as string,
    accepted: (row.accepted_at as string | null) !== null,
  }));
}

/** Create a pending invite for a teammate. */
export async function createInvite(
  email: string,
  workspaceId: string,
  invitedBy: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const { error } = await supabase.from('workspace_invites').insert({
    email: normalized,
    workspace_id: workspaceId,
    invited_by: invitedBy,
  });
  if (error) throw error;
}

/** Hard-delete an invite (revoke). */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('id', inviteId);
  if (error) throw error;
}
