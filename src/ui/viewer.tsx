import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createViewer, type Viewer } from '../core';

interface ViewerContextValue {
  viewer: Viewer | null; // null until the 3D engine has booted
  viewportRef(el: HTMLDivElement | null): void; // attach to the element that hosts the canvas
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

/** Owns the 3D viewer for the whole session; boots it once the viewport element mounts. */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    if (!viewport) return;
    let alive = true;
    let created: Viewer | undefined;
    void createViewer(viewport).then((v) => {
      created = v;
      if (alive) setViewer(v);
      else v.dispose();
    });
    return () => {
      alive = false;
      created?.dispose();
      setViewer(null);
    };
  }, [viewport]);

  return <ViewerContext.Provider value={{ viewer, viewportRef: setViewport }}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const v = useContext(ViewerContext);
  if (!v) throw new Error('useViewer outside ViewerProvider');
  return v;
}
