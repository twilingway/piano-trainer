import type { Finger } from "../../../fingering/fingering";
import studio from "../../../../tools/hand-rig/poses/studio-rest.json";
import { FINGERS } from "./mech";
import type { Rest, Vec3 } from "./mech";

// The studio hand's rest (tools/hand-rig/hand_rest.py): what hand.glb does not carry.

const vec = (v: readonly number[]): Vec3 => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
const perFinger = (r: Readonly<Record<string, readonly number[]>>) =>
  Object.fromEntries(FINGERS.map((f) => [f, vec(r[String(f)] ?? [])])) as Record<Finger, Vec3>;

/** The thumb's first phalanx at rest, a unit vector in the hand frame (F's rows are its axes). */
function thumbDirection(): Vec3 {
  const { head, tail } = studio.bones["finger1-1.R"];
  const d = vec(tail.map((v, i) => v - (head[i] ?? 0)));
  const [x, y, z] = studio.frame.F.map(
    (row) => (row[0] ?? 0) * d[0] + (row[1] ?? 0) * d[1] + (row[2] ?? 0) * d[2]
  );
  const length = Math.hypot(x ?? 0, y ?? 0, z ?? 0);
  return [(x ?? 0) / length, (y ?? 0) / length, (z ?? 0) / length];
}

/** The solver's rest of the right hand, mm in the hand frame. */
export const STUDIO_REST: Rest = {
  mcp: perFinger(studio.place.mcp),
  len: perFinger(studio.place.len),
  neutral: vec(studio.place.neutral),
  thumb: thumbDirection()
};

/** The rest the Python solver and its goldens use: the thumb turns from the index finger's
 * direction, flat on the palm. */
export const PYTHON_REST: Rest = { ...STUDIO_REST, thumb: vec(studio.place.idx) };

/** The hand frame in the rig's armature space (Blender axes): F's rows are the hand's axes, w the
 * wrist's head, S mm a unit. */
export const STUDIO_FRAME = {
  F: studio.frame.F.map(vec) as unknown as readonly [Vec3, Vec3, Vec3],
  w: vec(studio.frame.w),
  S: studio.frame.S
};

/** Bones at rest in armature space (Blender axes, units). */
export const STUDIO_BONES: Readonly<Record<string, { head: Vec3; tail: Vec3; length: number }>> =
  Object.fromEntries(
    Object.entries(studio.bones).map(([name, b]) => [
      name,
      { head: vec(b.head), tail: vec(b.tail), length: b.length }
    ])
  );
