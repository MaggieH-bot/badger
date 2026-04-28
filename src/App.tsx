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
import { ImportView } from './components/views/ImportView';
import { WorkspaceView } from './components/views/WorkspaceView';
import { DealForm } from './components/deals/DealForm';
import { DealDrawer } from './components/drawer/DealDrawer';
import { LoginScreen } from './components/auth/LoginScreen';

type DealFocus = 'next-step';

function AppContent() {
  const { route, navigate } = useRouter();
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  // Focus hint for the next drawer open. Today rows pass 'next-step' so the
  // workspace lands the user on the editable Next Step row; other views pass
  // nothing so the drawer opens at the top as before.
  const [selectedFocus, setSelectedFocus] = useState<DealFocus | null>(null);
  const { loading, fetchError, writeError, retryFetch, dismissWriteError } =
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
    <Shell route={route} navigate={navigate} onAddDeal={() => setShowAddDeal(true)}>
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
      {showAddDeal ? (
        <DealForm onClose={() => setShowAddDeal(false)} />
      ) : (
        <>
          {route === '#/' && (
            <TodayView onSelectDeal={handleSelectDeal} navigate={navigate} />
          )}
          {route === '#/pipeline' && <PipelineView onSelectDeal={handleSelectDeal} />}
          {route === '#/closed' && (
            <ClosedTransactionsView onSelectDeal={handleSelectDeal} />
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
          <p className="error-screen-detail">{error ?? 'Unknown error.'}</p>
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
