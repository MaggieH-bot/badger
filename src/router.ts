import { useState, useEffect } from 'react';
import type { AppRoute } from './types';
import { useUIPreferences } from './store/useUIPreferences';

const VALID_ROUTES: AppRoute[] = ['#/', '#/pipeline', '#/closed', '#/import', '#/workspace'];

// Legacy route map: old hash → new hash
const ROUTE_MIGRATIONS: Record<string, AppRoute> = {
  '#/deals': '#/pipeline',
};

function isValidRoute(hash: string): hash is AppRoute {
  return VALID_ROUTES.includes(hash as AppRoute);
}

// Resolve a hash to a valid AppRoute, applying legacy migrations.
// Returns null if the hash is neither valid nor a known legacy route.
function resolveValidRoute(hash: string): AppRoute | null {
  if (isValidRoute(hash)) return hash;
  if (hash in ROUTE_MIGRATIONS) return ROUTE_MIGRATIONS[hash];
  return null;
}

function resolveInitialRoute(storedRoute: AppRoute): AppRoute {
  const resolved = resolveValidRoute(window.location.hash);
  if (resolved !== null) return resolved;
  return storedRoute;
}

export function useRouter() {
  const { preferences, dispatch } = useUIPreferences();
  const [route, setRoute] = useState<AppRoute>(() =>
    resolveInitialRoute(preferences.lastRoute),
  );

  // Sync hash to state on hashchange (also handles in-session legacy hashes)
  useEffect(() => {
    function onHashChange() {
      const resolved = resolveValidRoute(window.location.hash);
      if (resolved !== null) {
        setRoute(resolved);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Ensure the URL hash matches the resolved route on mount
  // (this also rewrites legacy '#/deals' to the migrated route in the URL bar)
  useEffect(() => {
    if (window.location.hash !== route) {
      window.location.hash = route;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist route to UI preferences whenever it changes
  useEffect(() => {
    if (preferences.lastRoute !== route) {
      dispatch({ type: 'SET_LAST_ROUTE', route });
    }
  }, [route, preferences.lastRoute, dispatch]);

  function navigate(to: AppRoute) {
    window.location.hash = to;
  }

  return { route, navigate };
}
