import { DealsTable } from './DealsTable';

interface ArchivedViewProps {
  onSelectDeal: (dealId: string) => void;
}

// 15W-69: browse set-aside records ("The Den") and restore them. Mirrors
// ClosedTransactionsView — the DealsTable 'archived' mode handles the filter.
// "The Den" is the user-facing name; the underlying data concept is `archived`.
export function ArchivedView({ onSelectDeal }: ArchivedViewProps) {
  return (
    <div className="view">
      <div className="view-header">
        <h2>The Den</h2>
      </div>
      <DealsTable mode="archived" onSelectDeal={onSelectDeal} />
    </div>
  );
}
