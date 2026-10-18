import type { Finger } from "../../fingering/fingering";
import { CHAIN, FINGERS, at, fingerPlane, handJoints, rootRotation } from "./handSolver/mech";
import type { Angles, Rest, Root, Vec3 } from "./handSolver/mech";

export interface SkinTerm {
  readonly anchor: number;
  readonly offset: Vec3;
  readonly weight: number;
}
export interface SkinVertex {
  readonly source: number;
  readonly finger: Finger;
  readonly segment: number;
  readonly terms: readonly SkinTerm[];
}
export interface SkinGeometry {
  readonly vertices: readonly SkinVertex[];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
export const skinAnchor = (finger: Finger, segment: number): number =>
  1 + (finger - 1) * 3 + segment;

/** Pure linear-blend skinning on calibrated solver joint frames, with reusable numeric storage. */
export class SkinEvaluator {
  private readonly frames = new Float64Array(16 * 12);
  readonly positions: Float64Array;
  joints: readonly Vec3[] = [];
  constructor(
    readonly geometry: SkinGeometry,
    private readonly rest: Rest
  ) {
    this.positions = new Float64Array(geometry.vertices.length * 3);
  }

  evaluate(angles: Angles, root: Root): void {
    const X = handJoints(this.rest, angles, root),
      R = rootRotation(root);
    this.joints = X;
    this.setFrame(
      0,
      [root[3], root[4], root[5]],
      [R[0][0], R[1][0], R[2][0]],
      [R[0][1], R[1][1], R[2][1]],
      [R[0][2], R[1][2], R[2][2]]
    );
    for (const f of FINGERS) {
      const plane = fingerPlane(this.rest, angles, root, f),
        chain = CHAIN[f];
      for (let j = 0; j < 3; j++) {
        const head = at(X, at(chain, j)),
          tail = at(X, at(chain, j + 1));
        const y = unit([tail[0] - head[0], tail[1] - head[1], tail[2] - head[2]]),
          z = unit(cross(plane, y)),
          x = unit(cross(y, z));
        this.setFrame(skinAnchor(f, j), head, x, y, z);
      }
    }
    for (let i = 0; i < this.geometry.vertices.length; i++) {
      const vertex = this.geometry.vertices[i];
      if (!vertex) continue;
      let x = 0,
        y = 0,
        z = 0;
      for (const term of vertex.terms) {
        const b = term.anchor * 12,
          w = term.weight,
          ox = term.offset[0] * w,
          oy = term.offset[1] * w,
          oz = term.offset[2] * w,
          m = this.frames;
        x += (m[b] ?? 0) * w + (m[b + 3] ?? 0) * ox + (m[b + 6] ?? 0) * oy + (m[b + 9] ?? 0) * oz;
        y +=
          (m[b + 1] ?? 0) * w + (m[b + 4] ?? 0) * ox + (m[b + 7] ?? 0) * oy + (m[b + 10] ?? 0) * oz;
        z +=
          (m[b + 2] ?? 0) * w + (m[b + 5] ?? 0) * ox + (m[b + 8] ?? 0) * oy + (m[b + 11] ?? 0) * oz;
      }
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
    }
  }

  private setFrame(index: number, origin: Vec3, x: Vec3, y: Vec3, z: Vec3): void {
    this.frames.set([...origin, ...x, ...y, ...z], index * 12);
  }

  /** Inverse of a calibrated frame, used once when baking a model's support profile. */
  local(anchor: number, point: Vec3): Vec3 {
    const base = anchor * 12,
      p: Vec3 = [
        point[0] - (this.frames[base] ?? 0),
        point[1] - (this.frames[base + 1] ?? 0),
        point[2] - (this.frames[base + 2] ?? 0)
      ];
    const component = (axis: number) =>
      p[0] * (this.frames[base + axis] ?? 0) +
      p[1] * (this.frames[base + axis + 1] ?? 0) +
      p[2] * (this.frames[base + axis + 2] ?? 0);
    return [component(3), component(6), component(9)];
  }
}
