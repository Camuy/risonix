import { lazy, Suspense } from 'react';

import type { SeriesSelection } from '../api/stack';
import {
  is3dLayout,
  isMprLayout,
  LAYOUT_CAPACITY,
  type ViewportLayout,
} from '../hooks/useViewportLayout';
import type { ApiStatus } from '../hooks/useApiStatus';
import { MprLayout } from './MprLayout';
import { ViewportPane } from './ViewportPane';

/** VTK.js è pesante: la scena 3D è caricata solo quando si entra in quel layout. */
const VtkLayout = lazy(() =>
  import('./VtkLayout').then((module) => ({ default: module.VtkLayout })),
);

interface ViewportGridProps {
  layout: ViewportLayout;
  status: ApiStatus;
  assignments: (SeriesSelection | null)[];
  activeSlot: number;
  onActivate: (slot: number) => void;
  onRetry: () => void;
}

/** Griglia multi-viewport con crosshair sincronizzato (P2-05). */
export function ViewportGrid({
  layout,
  status,
  assignments,
  activeSlot,
  onActivate,
  onRetry,
}: ViewportGridProps) {
  if (isMprLayout(layout)) {
    return <MprLayout selection={assignments[0] ?? null} status={status} onRetry={onRetry} />;
  }

  if (is3dLayout(layout)) {
    return (
      <Suspense
        fallback={<section className="viewport-grid" data-layout="3d" aria-hidden="true" />}
      >
        <VtkLayout selection={assignments[0] ?? null} status={status} onRetry={onRetry} />
      </Suspense>
    );
  }

  const capacity = LAYOUT_CAPACITY[layout];

  return (
    <section className="viewport-grid" data-layout={layout} aria-label="Viewport immagini">
      {Array.from({ length: capacity }, (_, slot) => (
        <ViewportPane
          key={slot}
          viewportId={`risonix-viewport-${slot}`}
          active={slot === activeSlot}
          selection={assignments[slot] ?? null}
          status={status}
          onActivate={() => onActivate(slot)}
          onRetry={onRetry}
        />
      ))}
    </section>
  );
}
