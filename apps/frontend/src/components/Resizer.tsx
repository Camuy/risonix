import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface ResizerProps {
  side: 'left' | 'right';
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}

const KEY_STEP = 8;
const KEY_STEP_LARGE = 32;

/** Separatore ridimensionabile: drag col mouse, frecce con la tastiera. */
export function Resizer({ side, value, min, max, onChange, label }: ResizerProps) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, value });

  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, value };
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    const delta = event.clientX - start.current.x;
    onChange(clamp(side === 'left' ? start.current.value + delta : start.current.value - delta));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const growLeft = side === 'left' ? step : -step;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onChange(clamp(value + growLeft));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onChange(clamp(value - growLeft));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      onChange(max);
    }
  };

  return (
    <div
      className="resizer"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      data-dragging={dragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    />
  );
}
