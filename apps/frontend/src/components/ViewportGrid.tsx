import type { SeriesSelection } from '../api/stack';
import { LAYOUT_CAPACITY, type ViewportLayout } from '../hooks/useViewportLayout';
import type { ApiStatus } from '../hooks/useApiStatus';
import { ViewportPane } from './ViewportPane';

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
