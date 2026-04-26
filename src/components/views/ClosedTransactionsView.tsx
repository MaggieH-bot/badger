import { DealsTable } from './DealsTable';

interface ClosedTransactionsViewProps {
  onSelectDeal: (dealId: string) => void;
}

export function ClosedTransactionsView({ onSelectDeal }: ClosedTransactionsViewProps) {
  return (
    <div className="view">
      <div className="view-header">
        <h2>Closed Transactions</h2>
      </div>
      <DealsTable mode="closed" onSelectDeal={onSelectDeal} />
    </div>
  );
}
