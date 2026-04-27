import type { OpportunityType, Stage } from '../../types';

// Address: only relevant for sellers (Listing onward) and for closed buyers
// who actually closed on a property.
export function shouldShowAddress(
  type: OpportunityType | undefined,
  stage: Stage,
): boolean {
  if (type === 'sell' || type === 'both') {
    return stage === 'listing' || stage === 'under_contract' || stage === 'closed';
  }
  if (type === 'buy' || type === 'rent') {
    return stage === 'closed';
  }
  return false;
}

// Seller's list price: shown when seller is on Listing or Under Contract.
export function shouldShowSellerPrice(
  type: OpportunityType | undefined,
  stage: Stage,
): boolean {
  if (type !== 'sell' && type !== 'both') return false;
  return stage === 'listing' || stage === 'under_contract';
}

// Buyer's price range: shown when buyer is Active or Under Contract.
export function shouldShowBuyerPriceRange(
  type: OpportunityType | undefined,
  stage: Stage,
): boolean {
  if (type !== 'buy' && type !== 'both' && type !== 'rent') return false;
  return stage === 'active_buyer' || stage === 'under_contract';
}

// Closed price: any closed deal.
export function shouldShowClosedPrice(stage: Stage): boolean {
  return stage === 'closed';
}
