import type { ReactNode } from 'react';
import type { AppRoute } from '../../types';
import { NavBar } from './NavBar';

interface ShellProps {
  route: AppRoute;
  navigate: (to: AppRoute) => void;
  onAddDeal: () => void;
  children: ReactNode;
}

export function Shell({ route, navigate, onAddDeal, children }: ShellProps) {
  return (
    <div className="shell">
      <NavBar route={route} navigate={navigate} onAddDeal={onAddDeal} />
      <main className="shell-content">{children}</main>
    </div>
  );
}
