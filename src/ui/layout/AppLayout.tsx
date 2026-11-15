import type { ReactNode } from 'react';

interface AppLayoutProps {
  header: ReactNode;
  toolbar: ReactNode;
  viewer: ReactNode;
  boq: ReactNode;
  footer: ReactNode;
}

/** Workspace frame: top bar, toolbar, 3D viewer beside the BOQ (stacked on narrow screens), status bar. */
export function AppLayout({ header, toolbar, viewer, boq, footer }: AppLayoutProps) {
  return (
    <div className="app">
      {header}
      {toolbar}
      <main className="workspace">
        {viewer}
        {boq}
      </main>
      {footer}
    </div>
  );
}
