// Buyer price range display helpers.
// Pure formatting; no impact on save logic or data model.

const FULL_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPriceFull(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  return FULL_FMT.format(n);
}

/**
 * Render a buyer price range with the project-locked rules:
 *   - both values   → "$800,000 – $950,000" (en-dash)
 *   - min only      → "$800,000+"
 *   - max only      → "Up to $950,000"
 *   - neither       → null
 */
export function formatPriceRange(
  low: number | undefined,
  high: number | undefined,
): string | null {
  const hasLow = typeof low === 'number' && Number.isFinite(low) && low > 0;
  const hasHigh = typeof high === 'number' && Number.isFinite(high) && high > 0;
  if (hasLow && hasHigh) return `${formatPriceFull(low!)} – ${formatPriceFull(high!)}`;
  if (hasLow) return `${formatPriceFull(low!)}+`;
  if (hasHigh) return `Up to ${formatPriceFull(high!)}`;
  return null;
}
