/** Which screen the layout belongs to: the piano's keys, or the computer's in the word mode. */
export type LayoutMode = "piano" | "typing";

/** Where the player dragged the parts of the screen. */
export interface ScreenLayout {
  /** The wrapped staff's share of the window; unset, the staff takes its usual share. */
  readonly staffShare: number | undefined;
  /** The keys' lift off the view's bottom, as a share of the view's height. */
  readonly keysLift: number;
  /** The keys' size against the usual one. */
  readonly keysScale: number;
  /** The keys moved off the hit line, in pixels; 0, 0 keeps them on it. */
  readonly keysX: number;
  readonly keysY: number;
  /** The running line's gap over the hit line, in pixels; below 0 it hangs under the line. */
  readonly tickerGap: number;
  /** The running line moved sideways from the middle, in pixels. */
  readonly tickerX: number;
  /** The running line's text size against the usual one. */
  readonly tickerScale: number;
  /** Without the staff, the lane's top lowered by this share of the screen's height. */
  readonly laneTop: number;
}

export type ScreenLayouts = Readonly<Record<LayoutMode, ScreenLayout>>;

/** The staff's share of the window unless the player drags it. */
export const DEFAULT_STAFF_SHARE = 0.45;
export const DEFAULT_SCREEN_LAYOUT: ScreenLayout = {
  staffShare: undefined,
  keysLift: 0,
  keysScale: 1,
  keysX: 0,
  keysY: 0,
  tickerGap: 12,
  tickerX: 0,
  tickerScale: 1,
  laneTop: 0
};
/**
 * Where reset puts each mode: the piano as drawn; the computer keys lifted off the bottom and
 * moved under the running line, the line large and below the hit line (the player's own layout).
 */
export const DEFAULT_SCREEN_LAYOUTS: ScreenLayouts = {
  piano: DEFAULT_SCREEN_LAYOUT,
  typing: {
    ...DEFAULT_SCREEN_LAYOUT,
    keysLift: 0.222,
    keysX: -1,
    keysY: 101,
    tickerGap: -83,
    tickerX: -8,
    tickerScale: 1.7
  }
};
export const LAYOUT_LIMITS = {
  staffShare: [0.12, 0.8],
  keysLift: [0, 0.4],
  keysScale: [0.6, 1.8],
  keysX: [-2000, 2000],
  keysY: [-2000, 2000],
  tickerGap: [-1000, 2000],
  tickerX: [-2000, 2000],
  tickerScale: [0.6, 2.5],
  laneTop: [0, 0.5]
} as const;

const KEY = "screen-layout";

export function clampLayout(key: keyof typeof LAYOUT_LIMITS, value: number): number {
  const [low, high] = LAYOUT_LIMITS[key];
  return Math.min(high, Math.max(low, value));
}

/** A saved layout as far as it makes sense: a broken value falls back, one out of range is pulled in. */
export function normalizeLayout(
  value: unknown,
  defaults: ScreenLayout = DEFAULT_SCREEN_LAYOUT
): ScreenLayout {
  if (!value || typeof value !== "object") return defaults;
  const saved = value as Record<string, unknown>;
  const number = (key: keyof typeof LAYOUT_LIMITS, fallback: number) => {
    const raw = saved[key];
    return typeof raw === "number" && Number.isFinite(raw) ? clampLayout(key, raw) : fallback;
  };
  const share = saved.staffShare;
  return {
    staffShare:
      typeof share === "number" && Number.isFinite(share)
        ? clampLayout("staffShare", share)
        : defaults.staffShare,
    keysLift: number("keysLift", defaults.keysLift),
    keysScale: number("keysScale", defaults.keysScale),
    keysX: number("keysX", defaults.keysX),
    keysY: number("keysY", defaults.keysY),
    tickerGap: number("tickerGap", defaults.tickerGap),
    tickerX: number("tickerX", defaults.tickerX),
    tickerScale: number("tickerScale", defaults.tickerScale),
    laneTop: number("laneTop", defaults.laneTop)
  };
}

export function loadScreenLayouts(): ScreenLayouts {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const saved = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      piano: normalizeLayout(saved.piano, DEFAULT_SCREEN_LAYOUTS.piano),
      typing: normalizeLayout(saved.typing, DEFAULT_SCREEN_LAYOUTS.typing)
    };
  } catch {
    return DEFAULT_SCREEN_LAYOUTS;
  }
}

export function saveScreenLayouts(layouts: ScreenLayouts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layouts));
  } catch {
    // Private mode: the layout just starts at the defaults next time.
  }
}
