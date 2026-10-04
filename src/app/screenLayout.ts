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
  /** The running line's gap over the hit line, in pixels. */
  readonly tickerGap: number;
}

export type ScreenLayouts = Readonly<Record<LayoutMode, ScreenLayout>>;

/** The staff's share of the window unless the player drags it. */
export const DEFAULT_STAFF_SHARE = 0.45;
export const DEFAULT_SCREEN_LAYOUT: ScreenLayout = {
  staffShare: undefined,
  keysLift: 0,
  keysScale: 1,
  tickerGap: 12
};
export const LAYOUT_LIMITS = {
  staffShare: [0.12, 0.8],
  keysLift: [0, 0.4],
  keysScale: [0.6, 1.8],
  tickerGap: [0, 400]
} as const;

const KEY = "screen-layout";

export function clampLayout(key: keyof typeof LAYOUT_LIMITS, value: number): number {
  const [low, high] = LAYOUT_LIMITS[key];
  return Math.min(high, Math.max(low, value));
}

/** A saved layout as far as it makes sense: a broken value falls back, one out of range is pulled in. */
export function normalizeLayout(value: unknown): ScreenLayout {
  if (!value || typeof value !== "object") return DEFAULT_SCREEN_LAYOUT;
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
        : undefined,
    keysLift: number("keysLift", DEFAULT_SCREEN_LAYOUT.keysLift),
    keysScale: number("keysScale", DEFAULT_SCREEN_LAYOUT.keysScale),
    tickerGap: number("tickerGap", DEFAULT_SCREEN_LAYOUT.tickerGap)
  };
}

export function loadScreenLayouts(): ScreenLayouts {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const saved = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return { piano: normalizeLayout(saved.piano), typing: normalizeLayout(saved.typing) };
  } catch {
    return { piano: DEFAULT_SCREEN_LAYOUT, typing: DEFAULT_SCREEN_LAYOUT };
  }
}

export function saveScreenLayouts(layouts: ScreenLayouts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layouts));
  } catch {
    // Private mode: the layout just starts at the defaults next time.
  }
}
