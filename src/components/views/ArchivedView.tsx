import { DealsTable } from './DealsTable';

interface ArchivedViewProps {
  onSelectDeal: (dealId: string) => void;
}

// 15W-69: browse archived (set-aside) records and restore them. Mirrors
// ClosedTransactionsView — the DealsTable 'archived' mode handles the filter.
export function ArchivedView({ onSelectDeal }: ArchivedViewProps) {
  return (
    <div className="view">
      <div className="view-header">
        <h2>Archived</h2>
      </div>
      <DealsTable mode="archived" onSelectDeal={onSelectDeal} />
    </div>
  );
}
