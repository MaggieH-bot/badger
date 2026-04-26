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
