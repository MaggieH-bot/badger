import { supabase } from '../lib/supabase';
import type { Deal } from '../types';
import { rowToDeal, dealToInsertRow, dealToUpdateRow } from '../lib/mappers';
import type { DealRowWithChildren } from '../lib/types/db';

export async function fetchDealsForWorkspace(workspaceId: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*, contact_log_entries(*), notes(*), documents(*)')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return ((data as DealRowWithChildren[] | null) ?? []).map(rowToDeal);
}

export async function createDeal(
  deal: Deal,
  workspaceId: string,
  userId: string | null,
): Promise<void> {
  const row = dealToInsertRow(deal, workspaceId, userId);
  const { error } = await supabase.from('deals').insert(row);
  if (error) throw error;
}

export async function bulkInsertDeals(
  deals: Deal[],
  workspaceId: string,
  userId: string | null,
): Promise<void> {
  if (deals.length === 0) return;
  const rows = deals.map((d) => dealToInsertRow(d, workspaceId, userId));
  const { error } = await supabase.from('deals').insert(rows);
  if (error) throw error;
}

export async function updateDealRow(deal: Deal): Promise<void> {
  const row = dealToUpdateRow(deal);
  const { error } = await supabase.from('deals').update(row).eq('id', deal.id);
  if (error) throw error;
}

export async function deleteDealRow(dealId: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', dealId);
  if (error) throw error;
}

export async function archiveDealRow(dealId: string): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', dealId);
  if (error) throw error;
}

export async function unarchiveDealRow(dealId: string): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ archived: false, archived_at: null })
    .eq('id', dealId);
  if (error) throw error;
}

// Pair two deals as the buy/sell sides of one client. Each row points at the
// other. Two updates (Supabase has no client-side transaction); if the second
// fails the first is harmless on its own and a retry re-links cleanly.
export async function linkDeals(dealIdA: string, dealIdB: string): Promise<void> {
  const a = await supabase.from('deals').update({ linked_deal_id: dealIdB }).eq('id', dealIdA);
  if (a.error) throw a.error;
  const b = await supabase.from('deals').update({ linked_deal_id: dealIdA }).eq('id', dealIdB);
  if (b.error) throw b.error;
}

// Clear the link from both sides — the deal itself and whoever points at it.
export async function unlinkDeal(dealId: string): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ linked_deal_id: null })
    .or(`id.eq.${dealId},linked_deal_id.eq.${dealId}`);
  if (error) throw error;
}

export async function updateDealLastContact(
  dealId: string,
  isoTimestamp: string,
): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ last_contact: isoTimestamp })
    .eq('id', dealId);
  if (error) throw error;
}
