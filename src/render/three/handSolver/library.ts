import type { Finger, Hand } from "../../../fingering/fingering";
import { THUMB_KEYS, isBlack } from "./mech";
import type { Shape, ThumbAngles, ThumbKey } from "./mech";

// The example library (tools/hand-rig/hand_library.py): a hand's placement and finger shape per
// pressed shape, from the teacher's video.

export interface PressedNote {
  readonly finger: number;
  readonly semitones: number;
  readonly black: boolean;
}

export interface LibraryEntry {
  readonly id: string;
  readonly hand: string;
  readonly anchorPitch: number;
  readonly pressed: readonly PressedNote[];
  readonly thumb: string | null;
  readonly placement: {
    readonly knuckleDx: number;
    readonly knuckleDepthCm: number;
    readonly wristDx: number;
    readonly wristDepthCm: number;
    readonly yawDeg: number;
  };
  readonly count: number;
  readonly shape: {
    readonly fingers: Shape["fingers"];
    readonly thumb: ThumbAngles | null;
  } | null;
}

export interface Library {
  readonly entries: readonly LibraryEntry[];
}

/** A pressed note: its finger and pitch. */
export type FingerPitch = readonly [Finger, number];

/** The shape's key, its anchor pitch and its relative pressed list. */
export function shapeOf(hand: Hand, pressed: readonly FingerPitch[], thumb: string | null) {
  const sorted = [...pressed].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const anchor = sorted[0]?.[1] ?? 0;
  const rel: PressedNote[] = sorted.map(([finger, p]) => ({
    finger,
    semitones: p - anchor,
    black: isBlack(p)
  }));
  const key = `${hand[0]?.toUpperCase() ?? ""}:${sorted.map(([f, p]) => `${f}@${p}`).join(",")}:${thumb ?? "None"}`;
  return { key, anchor, rel };
}

export interface Found {
  readonly entry: LibraryEntry;
  readonly anchor: number;
  readonly source: "own" | "nearest";
}

const fingerList = (ps: readonly PressedNote[]) =>
  ps
    .map((r) => r.finger)
    .sort((a, b) => a - b)
    .join(",");

/** The best entry for a hand and its pressed notes, or undefined. */
export function nearest(
  library: Library,
  hand: Hand,
  pressed: readonly FingerPitch[],
  thumb: string | null = null
): Found | undefined {
  const { key, anchor, rel } = shapeOf(hand, pressed, thumb);
  const fingers = fingerList(rel);
  const pool = library.entries.filter((e) => e.hand === hand && fingerList(e.pressed) === fingers);
  if (pool.length === 0) return undefined;
  const iv = (ps: readonly PressedNote[]) => ps.map((r) => `${r.finger}:${r.semitones}`).join(",");
  const bw = (ps: readonly PressedNote[]) => ps.map((r) => r.black).join(",");
  const rank = (e: LibraryEntry): number[] => [
    iv(e.pressed) === iv(rel) ? 0 : 1,
    bw(e.pressed) === bw(rel) ? 0 : 1,
    thumb !== null && e.thumb !== thumb ? 1 : 0,
    Math.abs(e.anchorPitch - anchor),
    -e.count
  ];
  let best = pool[0] as LibraryEntry;
  let bestRank = rank(best);
  for (const e of pool.slice(1)) {
    const r = rank(e);
    const i = r.findIndex((v, k) => v !== bestRank[k]);
    if (i >= 0 && (r[i] ?? 0) < (bestRank[i] ?? 0)) {
      best = e;
      bestRank = r;
    }
  }
  return { entry: best, anchor, source: best.id === key ? "own" : "nearest" };
}

export interface Placement {
  readonly wristX: number;
  readonly wristDepthCm: number;
  readonly yawDeg: number;
}

/** The entry's placement where the target anchor key's centre is at anchorX (white keys). */
export function placement(entry: LibraryEntry, anchorX: number): Placement {
  const p = entry.placement;
  return { wristX: anchorX + p.wristDx, wristDepthCm: p.wristDepthCm, yawDeg: p.yawDeg };
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) throw new Error("median of nothing");
  const mid = Math.floor(n / 2);
  return n % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The library's median shape for a hand: the default when no example has the finger set. */
export function canonicalShape(library: Library, hand: Hand): Shape {
  const shapes = library.entries.flatMap((e) => (e.hand === hand && e.shape ? [e.shape] : []));
  const thumbs = shapes.map((s) => s.thumb).filter((t): t is ThumbAngles => t !== null);
  const finger = (f: "2" | "3" | "4" | "5") => ({
    abd: median(shapes.map((s) => s.fingers[f].abd)),
    rel: median(shapes.map((s) => s.fingers[f].rel))
  });
  const thumb = Object.fromEntries(THUMB_KEYS.map((k) => [k, median(thumbs.map((t) => t[k]))])) as Record<
    ThumbKey,
    number
  >;
  return { fingers: { 2: finger("2"), 3: finger("3"), 4: finger("4"), 5: finger("5") }, thumb };
}
