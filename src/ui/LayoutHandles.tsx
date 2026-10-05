import { useI18n } from "../app/useI18n";
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

/** What tells a line can be dragged: an arrow always, its name on hover. */
function Grip({ label }: { label: string }) {
  return (
    <span className="layout-grip" aria-hidden="true">
      ⇕<span className="layout-grip__label">{label}</span>
    </span>
  );
}

/** Within this many pixels of the hit line, moved keys stick back to it. */
const SNAP_PX = 16;

/**
 * The lines over and under the keys: the upper lifts the keyboard with the hit line, the lower
 * sizes it; a grip moves the keys alone, off the line and back.
 */
export function KeysHandles({ layout, onLayout }: { layout: ScreenLayout; onLayout: OnLayout }) {
  const { t } = useI18n();
  const move = useVerticalDrag({
    start: () => ({ x: layout.keysX, y: layout.keysY }),
    move: (dy, from, _element, dx) => {
      const x = from.x + dx;
      const y = from.y + dy;
      const stuck = Math.hypot(x, y) < SNAP_PX;
      onLayout({
        keysX: stuck ? 0 : clampLayout("keysX", x),
        keysY: stuck ? 0 : clampLayout("keysY", y)
      });
    }
  });
  const offset = { "--keys-y": `${String(layout.keysY)}px` } as CSSProperties;
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
        title={t("Тяните, чтобы поднять или опустить клавиатуру")}
        {...lift}
      >
        <Grip label={t("Поднять клавиатуру")} />
      </div>
      <div
        className="layout-handle layout-handle--keys-bottom"
        title={t("Тяните, чтобы изменить высоту клавиатуры")}
        style={offset}
        {...size}
      >
        <Grip label={t("Высота клавиатуры")} />
      </div>
      <div
        className="layout-move"
        title={t("Тяните, чтобы сдвинуть клавиатуру с линии нот; у линии она прилипнет обратно")}
        style={offset}
        {...move}
      >
        <span className="layout-grip">
          ✥<span className="layout-grip__label">{t("Двигать клавиатуру")}</span>
        </span>
      </div>
    </>
  );
}

/**
 * The word mode's running line: dragged anywhere, it keeps its place against the hit line. Off
 * the edit mode it stays where it is, with no drag and no tools.
 */
export function TickerSlot(props: {
  editing: boolean;
  gap: number;
  x: number;
  scale: number;
  onLayout: OnLayout;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const drag = useVerticalDrag({
    start: () => ({ gap: props.gap, x: props.x }),
    move: (dy, from, _element, dx) => {
      props.onLayout({
        tickerGap: clampLayout("tickerGap", from.gap - dy),
        tickerX: clampLayout("tickerX", from.x + dx)
      });
    }
  });
  return (
    <div
      className="word-ticker-slot"
      style={
        {
          "--ticker-gap": `${String(props.gap)}px`,
          "--ticker-x": `${String(props.x)}px`,
          "--ticker-scale": String(props.scale)
        } as CSSProperties
      }
      {...(props.editing ? { ...drag, title: t("Тяните, чтобы поднять или опустить строку") } : {})}
      data-editing={props.editing || undefined}
    >
      {props.children}
      {props.editing && (
        <div className="ticker-tools">
          <Grip label={t("Строка")} />
          {(
            [
              ["A−", -0.1, t("Уменьшить текст")],
              ["A+", 0.1, t("Увеличить текст")]
            ] as const
          ).map(([text, step, label]) => (
            <button
              key={text}
              type="button"
              className="ticker-zoom"
              aria-label={t(label)}
              title={t(label)}
              // The buttons size the text; only the line itself drags.
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={() => {
                const scale = Math.round((props.scale + step) * 10) / 10;
                props.onLayout({ tickerScale: clampLayout("tickerScale", scale) });
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
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
  const { t } = useI18n();
  const drag = useVerticalDrag({
    start: (element) => element.parentElement?.getBoundingClientRect().height ?? 0,
    move: (dy, _from, element) => {
      element.style.transform = `translateY(${String(dy)}px)`;
    },
    end: (dy, from, element) => {
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
      title={t("Тяните, чтобы изменить высоту нотного стана")}
      {...drag}
    >
      <Grip label={t("Высота стана")} />
    </div>
  );
}

/** Without the staff, the lane's top edge: dragged down, the falling notes start lower. */
export function LaneTopHandle({ top, onLayout }: { top: number; onLayout: OnLayout }) {
  const { t } = useI18n();
  const drag = useVerticalDrag({
    start: (element) => ({
      top,
      height: laneOf(element).parentElement?.clientHeight ?? 1
    }),
    move: (dy, from) => {
      onLayout({ laneTop: clampLayout("laneTop", from.top + dy / Math.max(1, from.height)) });
    }
  });
  return (
    <div
      className="layout-handle layout-handle--lane-top"
      title={t("Тяните, чтобы опустить или поднять верх падающих нот")}
      {...drag}
    >
      <Grip label={t("Верх дорожки")} />
    </div>
  );
}
