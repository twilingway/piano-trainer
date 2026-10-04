import { useRef } from "react";
import type { PointerEvent } from "react";

interface Drag<T> {
  /** What the drag starts from, read once as the pointer goes down. */
  readonly start: (element: HTMLElement) => T;
  /** The pointer is `dy` pixels below where it went down (and `dx` right of it). */
  readonly move?: (dy: number, from: T, element: HTMLElement, dx: number) => void;
  readonly end?: (dy: number, from: T, element: HTMLElement) => void;
}

/** Pointer handlers that drag an element up and down, measured from where the drag began. */
export function useVerticalDrag<T>(drag: Drag<T>) {
  const active = useRef<{
    pointer: number;
    x: number;
    y: number;
    dy: number;
    from: T;
  } | null>(null);
  const finish = (event: PointerEvent<HTMLElement>) => {
    const current = active.current;
    if (current?.pointer !== event.pointerId) return;
    active.current = null;
    drag.end?.(current.dy, current.from, event.currentTarget);
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dy: 0,
        from: drag.start(event.currentTarget)
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = active.current;
      if (current?.pointer !== event.pointerId) return;
      current.dy = event.clientY - current.y;
      drag.move?.(current.dy, current.from, event.currentTarget, event.clientX - current.x);
    },
    onPointerUp: finish,
    onPointerCancel: finish
  };
}
