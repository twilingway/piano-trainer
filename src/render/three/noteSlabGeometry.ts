import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { NOTE_SLAB_BEVEL, NOTE_SLAB_CORNER, NOTE_SLAB_THICKNESS } from "../noteDimensions";

export { NOTE_SLAB_BEVEL, NOTE_SLAB_CORNER, NOTE_SLAB_THICKNESS } from "../noteDimensions";
const CORNER_SEGMENTS = 6;

export const NOTE_SLAB_ATTRIBUTES = /* glsl */ `
attribute vec2 slabCorner;
attribute vec2 slabArc;
attribute vec3 slabProfile;
`;

/** Planar corner radius and vertical chamfer are independent of the slab's height. */
export const NOTE_SLAB_VERTEX = /* glsl */ `
float slabRadius = min(noteSize.x * ${String(NOTE_SLAB_CORNER)}, noteSize.z * 0.45);
float slabBevel = min(noteSize.x * ${String(NOTE_SLAB_BEVEL)}, min(slabRadius * 0.45, noteSize.y * 0.25));
vec2 slabXZ = slabCorner * (noteSize.xz * 0.5 - vec2(slabRadius));
slabXZ += slabArc * (slabRadius - slabProfile.z * slabBevel);
vec3 slabPoint = vec3(slabXZ.x, slabProfile.x * noteSize.y + slabProfile.y * slabBevel, slabXZ.y);
`;

interface Vertex {
  cx: number;
  cz: number;
  ax: number;
  az: number;
  y: number;
  bevelY: number;
  inset: number;
}

/** Four rings preserve a flat side band and crisp chamfers, including on very long notes. */
export function createNoteSlabGeometry(width = 1, depth = 1): BufferGeometry {
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0)
    throw new RangeError("Note slab dimensions must be finite and positive");
  const height = width * NOTE_SLAB_THICKNESS;
  const radius = Math.min(width * NOTE_SLAB_CORNER, depth * 0.45);
  const bevel = Math.min(width * NOTE_SLAB_BEVEL, radius * 0.45, height * 0.25);
  const perimeter: { cx: number; cz: number; ax: number; az: number }[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const cx = corner === 0 || corner === 3 ? 1 : -1;
    const cz = corner < 2 ? 1 : -1;
    for (let segment = 0; segment <= CORNER_SEGMENTS; segment++) {
      const angle = (corner + segment / CORNER_SEGMENTS) * Math.PI * 0.5;
      perimeter.push({ cx, cz, ax: Math.cos(angle), az: Math.sin(angle) });
    }
  }
  const rings = [
    { y: 0.5, bevelY: 0, inset: 1 },
    { y: 0.5, bevelY: -1, inset: 0 },
    { y: -0.5, bevelY: 1, inset: 0 },
    { y: -0.5, bevelY: 0, inset: 1 }
  ].map((profile) => perimeter.map((point): Vertex => ({ ...point, ...profile })));
  const positions: number[] = [];
  const normals: number[] = [];
  const corners: number[] = [];
  const arcs: number[] = [];
  const profiles: number[] = [];
  const pa = new Vector3();
  const pb = new Vector3();
  const pc = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const normal = new Vector3();
  const point = (vertex: Vertex, target: Vector3): Vector3 =>
    target.set(
      vertex.cx * (width / 2 - radius) + vertex.ax * (radius - vertex.inset * bevel),
      vertex.y * height + vertex.bevelY * bevel,
      vertex.cz * (depth / 2 - radius) + vertex.az * (radius - vertex.inset * bevel)
    );
  const triangle = (a: Vertex, b: Vertex, c: Vertex): void => {
    point(a, pa);
    point(b, pb);
    point(c, pc);
    normal.crossVectors(ab.subVectors(pb, pa), ac.subVectors(pc, pa)).normalize();
    positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
    for (const vertex of [a, b, c]) {
      normals.push(normal.x, normal.y, normal.z);
      corners.push(vertex.cx, vertex.cz);
      arcs.push(vertex.ax, vertex.az);
      profiles.push(vertex.y, vertex.bevelY, vertex.inset);
    }
  };
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const upper = rings[ring];
    const lower = rings[ring + 1];
    if (!upper || !lower) continue;
    for (let index = 0; index < perimeter.length; index++) {
      const next = (index + 1) % perimeter.length;
      const a = upper[index];
      const b = upper[next];
      const c = lower[next];
      const d = lower[index];
      if (!a || !b || !c || !d) continue;
      triangle(a, b, c);
      triangle(a, c, d);
    }
  }
  for (const ringIndex of [0, 3]) {
    const ring = rings[ringIndex];
    if (!ring) continue;
    const centre: Vertex = {
      cx: 0,
      cz: 0,
      ax: 0,
      az: 0,
      y: ringIndex === 0 ? 0.5 : -0.5,
      bevelY: 0,
      inset: 1
    };
    for (let index = 0; index < perimeter.length; index++) {
      const a = ring[index];
      const b = ring[(index + 1) % perimeter.length];
      if (!a || !b) continue;
      if (ringIndex === 0) triangle(centre, b, a);
      else triangle(centre, a, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.name = "note-chamfered-slab";
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("slabCorner", new Float32BufferAttribute(corners, 2));
  geometry.setAttribute("slabArc", new Float32BufferAttribute(arcs, 2));
  geometry.setAttribute("slabProfile", new Float32BufferAttribute(profiles, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
