import type { CSSProperties, ReactNode } from "react";

import { clampLayout } from "../app/screenLayout";
import type { ScreenLayout } from "../app/screenLayout";
import { ZOOM_MAX, ZOOM_MIN } from "./settings/StaffSettings";
import { useVerticalDrag } from "./useVerticalDrag";

type OnLayout = (change: Partial<ScreenLayout>) => void;

/** The lane a handle sits in, and a length the view wrote on it. */
const laneOf = (element: HTMLElement) => element.parentElement ?? element;
const laneLength = (lane: HTMLElement, name: string) =>
  Number.parseFloat(getComputedStyle(lane).getPropertyValue(name)) || 0;

/** The lines over and under the keys: the upper lifts the keyboard, the lower sizes it. */
export function KeysHandles({ layout, onLayout }: { layout: ScreenLayout; onLayout: OnLayout }) {
  const lift = useVerticalDrag({
    start: (element) => ({ lift: layout.keysLift, height: laneOf(element).clientHeight || 1 }),
    move: (dy, from) => {
      onLayout({ keysLift: clampLayout("keysLift", from.lift - dy / from.height) });
    }
  });
  const size = useVerticalDrag({
    start: (element) => {
      const lane = laneOf(element);
      return {
        lift: layout.keysLift,
        scale: layout.keysScale,
        height: lane.clientHeight || 1,
        size: Math.max(1, laneLength(lane, "--keys-bottom") - laneLength(lane, "--hit-line"))
      };
    },
    move: (dy, from) => {
      // The top stays put: what the keys grow by, the floor under them loses.
      const scale = clampLayout("keysScale", (from.scale * (from.size + dy)) / from.size);
      const grown = from.size * (scale / from.scale - 1);
      onLayout({
        keysScale: scale,
        keysLift: clampLayout("keysLift", from.lift - grown / from.height)
      });
    }
  });
  return (
    <>
      <div
        className="layout-handle layout-handle--keys-top"
        title="Тяните, чтобы поднять или опустить клавиатуру"
        {...lift}
      />
      <div
        className="layout-handle layout-handle--keys-bottom"
        title="Тяните, чтобы изменить высоту клавиатуры"
        {...size}
      />
    </>
  );
}

/** The word mode's running line, dragged up off the hit line. */
export function TickerSlot(props: { gap: number; onLayout: OnLayout; children: ReactNode }) {
  const drag = useVerticalDrag({
    start: () => props.gap,
    move: (dy, from) => {
      props.onLayout({ tickerGap: clampLayout("tickerGap", from - dy) });
    }
  });
  return (
    <div
      className="word-ticker-slot"
      style={{ "--ticker-gap": `${String(props.gap)}px` } as CSSProperties}
      title="Тяните, чтобы поднять или опустить строку"
      {...drag}
    >
      {props.children}
    </div>
  );
}

interface StaffHandleProps {
  readonly singleLine: boolean;
  readonly zoom: number;
  /** How much of the share the room around the staff gives it. */
  readonly room: number;
  readonly onLayout: OnLayout;
  readonly onZoom: (zoom: number) => void;
}

/**
 * The staff's lower edge. Drawing the score is dear, so the edge only moves while dragged and the
 * staff is laid out once on release: a wrapped one takes the lines that fit, one line its zoom.
 */
export function StaffHandle(props: StaffHandleProps) {
  const drag = useVerticalDrag({
    start: (element) => {
      element.dataset.dragging = "";
      return element.parentElement?.getBoundingClientRect().height ?? 0;
    },
    move: (dy, _from, element) => {
      element.style.transform = `translateY(${String(dy)}px)`;
    },
    end: (dy, from, element) => {
      delete element.dataset.dragging;
      element.style.transform = "";
      if (Math.abs(dy) < 3 || from <= 0) return;
      const wanted = Math.max(24, from + dy);
      if (props.singleLine) {
        const zoom = Math.round(((props.zoom * wanted) / from) * 20) / 20;
        props.onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)));
      } else {
        props.onLayout({
          staffShare: clampLayout("staffShare", wanted / window.innerHeight / props.room)
        });
      }
    }
  });
  return (
    <div
      className="layout-handle layout-handle--staff"
      title="Тяните, чтобы изменить высоту нотного стана"
      {...drag}
    />
  );
}
