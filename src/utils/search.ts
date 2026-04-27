import type { Deal } from '../types';

/**
 * Case-insensitive substring match across V1 search fields:
 * client name, address, email, phone. Empty / whitespace queries match all.
 */
export function matchesSearch(deal: Deal, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [deal.clientName, deal.address, deal.email, deal.phone]
    .filter((v): v is string => Boolean(v))
    .map((s) => s.toLowerCase())
    .join('  ');
  return haystack.includes(q);
}
