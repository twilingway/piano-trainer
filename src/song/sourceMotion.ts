import type { Finger, Hand } from "../fingering/fingering";

export type MotionRoot = readonly [number, number, number, number, number, number];
export type MotionThumbKey = "cmc_radial" | "cmc_palmar" | "t_mcp" | "t_ip";
export type MotionJointKey = "mcp" | "pip" | "dip" | "abd";
export type MotionAngles = { readonly 1: Readonly<Record<MotionThumbKey, number>> } & Readonly<
  Record<2 | 3 | 4 | 5, Readonly<Record<MotionJointKey, number>>>
>;
export type MotionDelta = Readonly<
  Partial<Record<Finger, Readonly<Partial<Record<MotionThumbKey | MotionJointKey, number>>>>>
>;
export interface MotionPose {
  readonly rootVec: MotionRoot;
  readonly angles: MotionAngles;
  readonly press: MotionDelta;
  readonly hover: MotionDelta;
  readonly pitches: Readonly<Partial<Record<Finger, number>>>;
}
export interface MotionKey {
  readonly t: number;
  readonly phase: "ready" | "strike" | "depart";
  readonly strike: number;
}
export interface MotionFrame {
  readonly time: number;
  readonly root: MotionRoot;
  readonly angles: MotionAngles;
}
export interface PrecomputedHandTrack {
  readonly done: true;
  readonly keys: readonly MotionKey[];
  readonly poses: readonly MotionPose[];
  readonly frames: readonly MotionFrame[];
}
/** Kinematic fallback data, never native MPFB bone transforms or a retargeted animation. */
export interface PrecomputedHandTracks {
  readonly schemaVersion: 1;
  readonly profile: string;
  readonly units: "solver-mm-degrees-v1";
  readonly midiSha256: string;
  readonly sourceSha256: string;
  readonly modelSha256: string;
  readonly anatomySha256: string;
  readonly solverSha256: string;
  readonly whiteKeyWidthMm: number;
  readonly duration: number;
  readonly sampleRate: number;
  readonly tracks: Readonly<Record<Hand, PrecomputedHandTrack>>;
}

const FINGERS = ["1", "2", "3", "4", "5"];
const THUMB = ["cmc_radial", "cmc_palmar", "t_mcp", "t_ip"];
const JOINTS = ["mcp", "pip", "dip", "abd"];
const HASHES = ["midiSha256", "sourceSha256", "modelSha256", "anatomySha256", "solverSha256"];
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const requireValue = (ok: unknown, path: string): void => {
  if (!ok) throw new Error("Invalid precomputed hand motion: " + path);
};
const fields = (v: unknown, names: readonly string[]): boolean =>
  object(v) &&
  Object.keys(v).length === names.length &&
  names.every((n) => finite(v[n]) && Math.abs(v[n]) <= 3600);
const root = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length === 6 &&
  Array.from(v).every((n: unknown, i) => finite(n) && Math.abs(n) <= (i < 3 ? 3600 : 1000000));
const angles = (v: unknown): boolean =>
  object(v) &&
  Object.keys(v).length === 5 &&
  FINGERS.every((f) => fields(v[f], f === "1" ? THUMB : JOINTS));
const delta = (v: unknown): boolean =>
  object(v) &&
  Object.entries(v).every(
    ([f, a]) =>
      FINGERS.includes(f) &&
      object(a) &&
      Object.entries(a).every(
        ([key, value]) => (f === "1" ? THUMB : JOINTS).includes(key) && finite(value)
      )
  );
const pitches = (v: unknown): boolean =>
  object(v) &&
  Object.entries(v).every(
    ([f, pitch]) =>
      FINGERS.includes(f) && finite(pitch) && Number.isInteger(pitch) && pitch >= 0 && pitch <= 127
  );
const pose = (v: unknown): boolean =>
  object(v) &&
  root(v.rootVec) &&
  angles(v.angles) &&
  delta(v.press) &&
  delta(v.hover) &&
  pitches(v.pitches);
const frame = (v: unknown): v is MotionFrame =>
  object(v) && finite(v.time) && root(v.root) && angles(v.angles);
const key = (v: unknown, count: number): v is MotionKey =>
  object(v) &&
  finite(v.t) &&
  (v.phase === "ready" || v.phase === "strike" || v.phase === "depart") &&
  finite(v.strike) &&
  Number.isInteger(v.strike) &&
  v.strike >= 0 &&
  v.strike < count;

function readTrack(value: unknown, duration: number, rate: number, hand: Hand): void {
  requireValue(object(value), hand);
  if (!object(value)) return;
  requireValue(
    value.done === true &&
      Array.isArray(value.keys) &&
      Array.isArray(value.poses) &&
      Array.isArray(value.frames),
    hand + ".complete"
  );
  const keys = value.keys as unknown[],
    poses = value.poses as unknown[],
    frames = value.frames as unknown[];
  requireValue(
    keys.length <= 100000 && poses.length <= 100000 && frames.length <= 1000000,
    hand + ".capacity"
  );
  requireValue(Array.from(poses).every(pose), hand + ".poses");
  requireValue(
    Array.from(keys).every((v) => key(v, poses.length)),
    hand + ".keys"
  );
  requireValue(Array.from(frames).every(frame), hand + ".frames");
  if (keys.length === 0) {
    requireValue(poses.length === 0 && frames.length === 0, hand + ".empty");
    return;
  }
  const typedKeys = keys as MotionKey[],
    typedFrames = frames as MotionFrame[];
  requireValue(
    typedFrames[0]?.time === 0 && typedFrames.at(-1)?.time === duration,
    hand + ".coverage"
  );
  let previous = -Infinity;
  for (const k of typedKeys) {
    requireValue(k.t >= previous && k.t <= duration, hand + ".keyOrder");
    previous = k.t;
  }
  previous = -Infinity;
  for (const f of typedFrames) {
    requireValue(f.time > previous && f.time >= 0 && f.time <= duration, hand + ".frameOrder");
    requireValue(
      previous === -Infinity || f.time - previous <= 1 / rate + 1e-7,
      hand + ".frameGap"
    );
    previous = f.time;
  }
  const times = new Set(typedFrames.map((f) => f.time));
  requireValue(
    typedKeys.every((k) => k.t < 0 || times.has(k.t)),
    hand + ".phaseFrames"
  );
}

/** Validate before playback. Invalid or partial tracks never become an implicit live-plan request. */
export function readSourceMotion(value: unknown): PrecomputedHandTracks {
  requireValue(object(value), "object");
  if (!object(value)) throw new Error("Invalid precomputed hand motion");
  requireValue(value.schemaVersion === 1 && value.units === "solver-mm-degrees-v1", "schema");
  requireValue(
    typeof value.profile === "string" && value.profile.length > 0 && value.profile.length <= 128,
    "profile"
  );
  for (const name of HASHES)
    requireValue(typeof value[name] === "string" && /^[a-f0-9]{64}$/.test(value[name]), name);
  requireValue(
    finite(value.whiteKeyWidthMm) && value.whiteKeyWidthMm > 0 && value.whiteKeyWidthMm <= 100,
    "whiteKeyWidthMm"
  );
  requireValue(finite(value.duration) && value.duration >= 0 && value.duration <= 3600, "duration");
  requireValue(
    finite(value.sampleRate) && value.sampleRate >= 1 && value.sampleRate <= 240,
    "sampleRate"
  );
  requireValue(object(value.tracks), "tracks");
  const tracks = value.tracks as Record<string, unknown>;
  readTrack(tracks.left, value.duration as number, value.sampleRate as number, "left");
  readTrack(tracks.right, value.duration as number, value.sampleRate as number, "right");
  return value as unknown as PrecomputedHandTracks;
}
