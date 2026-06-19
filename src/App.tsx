import { useState, useCallback, type ReactNode } from 'react';
import { AuthProvider } from './store/AuthProvider';
import { useAuth } from './store/useAuth';
import { WorkspaceProvider } from './store/WorkspaceProvider';
import { useWorkspace } from './store/useWorkspace';
import { DealsProvider } from './store/DealsProvider';
import { useDeals } from './store/useDeals';
import { UIProvider } from './store/UIProvider';
import { useRouter } from './router';
import { Shell } from './components/layout/Shell';
import { TodayView } from './components/views/TodayView';
import { PipelineView } from './components/views/PipelineView';
import { ClosedTransactionsView } from './components/views/ClosedTransactionsView';
import { ArchivedView } from './components/views/ArchivedView';
import { ImportView } from './components/views/ImportView';
import { WorkspaceView } from './components/views/WorkspaceView';
import { DealForm, type DealFormPrefill } from './components/deals/DealForm';
import { DealDrawer } from './components/drawer/DealDrawer';
import { LoginScreen } from './components/auth/LoginScreen';
import type { Deal, OpportunityType } from './types';

type DealFocus = 'next-step';

// State for the Add Client form: null = closed; an object = open, optionally
// prefilled to create + link the other side of a pair (15W-70 Phase 1).
interface AddDealState {
  prefill?: DealFormPrefill;
  linkToDealId?: string;
}

const oppositeSide = (t: 'buy' | 'sell'): 'buy' | 'sell' =>
  t === 'buy' ? 'sell' : 'buy';

// Shared-contact fields carried to the new side; side-specific fields are left
// for the agent to fill on the fresh record.
function buildOtherSidePrefill(
  deal: Deal,
  otherType: OpportunityType,
): DealFormPrefill {
  return {
    clientName: deal.clientName,
    opportunityType: otherType,
    category: deal.category,
    assignedTo: deal.assignedTo,
    phone: deal.phone,
    email: deal.email,
    areaOfInterest: deal.areaOfInterest,
    leadSource: deal.leadSource,
  };
}

function AppContent() {
  const { route, navigate } = useRouter();
  const [addDeal, setAddDeal] = useState<AddDealState | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  // Focus hint for the next drawer open. Today rows pass 'next-step' so the
  // workspace lands the user on the editable Next Step row; other views pass
  // nothing so the drawer opens at the top as before.
  const [selectedFocus, setSelectedFocus] = useState<DealFocus | null>(null);
  const { dispatch, loading, fetchError, writeError, retryFetch, dismissWriteError } =
    useDeals();

  const handleSelectDeal = useCallback(
    (dealId: string, focus?: DealFocus) => {
      setSelectedDealId(dealId);
      setSelectedFocus(focus ?? null);
    },
    [],
  );

  const handleCloseDrawer = useCallback(() => {
    setSelectedDealId(null);
    setSelectedFocus(null);
  }, []);

  // "Add the other side": open the Add form prefilled for the opposite side and
  // link it on save. Closes the drawer so the form (which replaces the views)
  // is visible.
  const handleAddOtherSide = useCallback((deal: Deal) => {
    if (deal.opportunityType !== 'buy' && deal.opportunityType !== 'sell') return;
    const otherType = oppositeSide(deal.opportunityType);
    setAddDeal({ prefill: buildOtherSidePrefill(deal, otherType), linkToDealId: deal.id });
    setSelectedDealId(null);
    setSelectedFocus(null);
  }, []);

  // "Split into buy + sell": convert the legacy Both record to the chosen side
  // (keeps its history), then open the Add form for the opposite side to create
  // + link it.
  const handleSplitBoth = useCallback(
    (deal: Deal, thisSide: 'buy' | 'sell') => {
      const converted: Deal = { ...deal, opportunityType: thisSide };
      dispatch({ type: 'UPDATE_DEAL', deal: converted });
      const otherType = oppositeSide(thisSide);
      setAddDeal({
        prefill: buildOtherSidePrefill(converted, otherType),
        linkToDealId: deal.id,
      });
      setSelectedDealId(null);
      setSelectedFocus(null);
    },
    [dispatch],
  );

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="loading-screen-text">Loading pipeline…</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="error-screen">
        <div className="error-screen-card">
          <h2 className="error-screen-title">Couldn't load pipeline</h2>
          <p className="error-screen-detail">{fetchError}</p>
          <button type="button" className="btn btn--primary" onClick={retryFetch}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <Shell route={route} navigate={navigate} onAddDeal={() => setAddDeal({})}>
      {writeError && (
        <div className="write-error-banner" role="status">
          <span className="write-error-text">{writeError}</span>
          <button
            type="button"
            className="write-error-dismiss"
            onClick={dismissWriteError}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {addDeal ? (
        <DealForm
          onClose={() => setAddDeal(null)}
          prefill={addDeal.prefill}
          linkToDealId={addDeal.linkToDealId}
        />
      ) : (
        <>
          {route === '#/' && (
            <TodayView onSelectDeal={handleSelectDeal} navigate={navigate} />
          )}
          {route === '#/pipeline' && <PipelineView onSelectDeal={handleSelectDeal} />}
          {route === '#/closed' && (
            <ClosedTransactionsView onSelectDeal={handleSelectDeal} />
          )}
          {route === '#/den' && (
            <ArchivedView onSelectDeal={handleSelectDeal} />
          )}
          {route === '#/import' && <ImportView />}
          {route === '#/workspace' && <WorkspaceView />}
        </>
      )}
      {selectedDealId && (
        <DealDrawer
          dealId={selectedDealId}
          onClose={handleCloseDrawer}
          initialFocus={selectedFocus ?? undefined}
          onSelectDeal={handleSelectDeal}
          onAddOtherSide={handleAddOtherSide}
          onSplitBoth={handleSplitBoth}
        />
      )}
    </Shell>
  );
}

function WorkspaceGate({ children }: { children: ReactNode }) {
  const { workspace, loading, error, retry } = useWorkspace();

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="loading-screen-text">Setting up your workspace…</span>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="error-screen">
        <div className="error-screen-card">
          <h2 className="error-screen-title">Couldn't set up your workspace</h2>
          <p className="error-screen-detail">{error ?? "Not sure what tripped it up. Give it another shot."}</p>
          <button type="button" className="btn btn--primary" onClick={retry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="loading-screen-text">Loading…</span>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <WorkspaceProvider>
      <WorkspaceGate>
        <UIProvider>
          <DealsProvider>
            <AppContent />
          </DealsProvider>
        </UIProvider>
      </WorkspaceGate>
    </WorkspaceProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
