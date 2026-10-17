import type { Finger } from "../../../fingering/fingering";
import studio from "../../../../tools/hand-rig/poses/studio-rest.json";
import { FINGERS } from "./mech";
import type { Rest, Vec3 } from "./mech";

// The studio hand's rest (tools/hand-rig/hand_rest.py): what hand.glb does not carry.

const vec = (v: readonly number[]): Vec3 => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
const perFinger = (r: Readonly<Record<string, readonly number[]>>) =>
  Object.fromEntries(FINGERS.map((f) => [f, vec(r[String(f)] ?? [])])) as Record<Finger, Vec3>;

/** The solver's rest of the right hand, mm in the hand frame. */
export const STUDIO_REST: Rest = {
  mcp: perFinger(studio.place.mcp),
  len: perFinger(studio.place.len),
  neutral: vec(studio.place.neutral),
  idx: vec(studio.place.idx)
};

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
