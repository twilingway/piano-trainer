import { Float32BufferAttribute, Uint32BufferAttribute } from "three";
import type { BufferGeometry } from "three";
import { KIT_TOP } from "./pianoKit";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** A shared intersection row prevents a front triangle spanning below the white key from bending. */
function splitAtWhiteTop(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const sourceIndex = geometry.getIndex();
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => ({
    name,
    attribute,
    values: Array.from({ length: attribute.count * attribute.itemSize }, (_, i) =>
      attribute.getComponent(Math.floor(i / attribute.itemSize), i % attribute.itemSize)
    )
  }));
  const indices: number[] = [];
  const intersections = new Map<number, number>();
  const positionValues = attributes.find(({ name }) => name === "position")?.values ?? [];
  let vertices = position.count;
  const height = (vertex: number) => positionValues[vertex * 3 + 1] ?? KIT_TOP;
  const intersection = (a: number, b: number) => {
    if (height(a) === KIT_TOP) return a;
    if (height(b) === KIT_TOP) return b;
    const key = Math.min(a, b) * position.count + Math.max(a, b);
    const previous = intersections.get(key);
    if (previous !== undefined) return previous;
    const t = (KIT_TOP - height(a)) / (height(b) - height(a));
    const vertex = vertices++;
    for (const { name, attribute, values } of attributes) {
      for (let component = 0; component < attribute.itemSize; component++) {
        const start = values[a * attribute.itemSize + component] ?? 0;
        const end = values[b * attribute.itemSize + component] ?? start;
        values.push(name === "position" && component === 1 ? KIT_TOP : start + (end - start) * t);
      }
    }
    intersections.set(key, vertex);
    return vertex;
  };
  const clip = (triangle: readonly number[], above: boolean) => {
    const polygon: number[] = [];
    for (let i = 0; i < 3; i++) {
      const previous = triangle[(i + 2) % 3];
      const current = triangle[i];
      if (previous === undefined || current === undefined) continue;
      const wasInside = above ? height(previous) >= KIT_TOP : height(previous) <= KIT_TOP;
      const inside = above ? height(current) >= KIT_TOP : height(current) <= KIT_TOP;
      if (inside !== wasInside) polygon.push(intersection(previous, current));
      if (inside) polygon.push(current);
    }
    for (let i = 1; i + 1 < polygon.length; i++) {
      const a = polygon[0],
        b = polygon[i],
        c = polygon[i + 1];
      if (a !== undefined && b !== undefined && c !== undefined && a !== b && b !== c && a !== c)
        indices.push(a, b, c);
    }
  };
  const count = sourceIndex?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const a = sourceIndex?.getX(i) ?? i;
    const b = sourceIndex?.getX(i + 1) ?? i + 1;
    const c = sourceIndex?.getX(i + 2) ?? i + 2;
    const low = Math.min(height(a), height(b), height(c));
    const high = Math.max(height(a), height(b), height(c));
    if (low < KIT_TOP && high > KIT_TOP) {
      clip([a, b, c], true);
      clip([a, b, c], false);
    } else indices.push(a, b, c);
  }
  for (const { name, attribute, values } of attributes)
    geometry.setAttribute(
      name,
      new Float32BufferAttribute(values, attribute.itemSize, attribute.normalized)
    );
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
}

/** Find the original broad front plane, excluding the tiny rounded perimeter triangles. */
function whiteContactZ(geometry: BufferGeometry, centreX: number, fallback: number): number {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  let largest = 0;
  let contact = fallback;
  const count = index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const a = index?.getX(i) ?? i,
      b = index?.getX(i + 1) ?? i + 1,
      c = index?.getX(i + 2) ?? i + 2;
    const ax = position.getX(a),
      ay = position.getY(a),
      az = position.getZ(a);
    const bx = position.getX(b) - ax,
      by = position.getY(b) - ay,
      bz = position.getZ(b) - az;
    const cx = position.getX(c) - ax,
      cy = position.getY(c) - ay,
      cz = position.getZ(c) - az;
    const nx = by * cz - bz * cy,
      ny = bz * cx - bx * cz,
      nz = bx * cy - by * cx;
    const area = Math.hypot(nx, ny, nz);
    if (area > largest && nz > area * 0.5 && ny > area * 0.2) {
      largest = area;
      contact = az - (nx * (centreX - ax) + ny * (KIT_TOP - ay)) / nz;
    }
  }
  return contact;
}

/** Shape an owned, world-sized black key clone; its slot, underside and rear stay unchanged. */
export function blackKeyCap(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return geometry;
  const depth = bounds.max.z - bounds.min.z;
  const width = bounds.max.x - bounds.min.x;
  const centreX = (bounds.max.x + bounds.min.x) / 2;
  const raised = bounds.max.y - KIT_TOP;
  if (depth <= 0 || width <= 0 || raised <= 0) return geometry;
  const frontZ = bounds.max.z;
  const extraSlope = Math.min(8, depth * 0.1);
  const contactZ = whiteContactZ(geometry, centreX, frontZ - depth * 0.06);
  let topFrontZ = -Infinity;
  const original = geometry.getAttribute("position");
  for (let i = 0; i < original.count; i++)
    if (original.getY(i) >= bounds.max.y - 1e-4) topFrontZ = Math.max(topFrontZ, original.getZ(i));
  const slope = (contactZ - (topFrontZ - extraSlope)) / raised;
  splitAtWhiteTop(geometry);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(position.count * 3);
  const planeLength = Math.hypot(slope, 1);
  for (let vertex = 0; vertex < position.count; vertex++) {
    const z = position.getZ(vertex);
    const front = smooth((z - (frontZ - depth * 0.36)) / (depth * 0.14));
    const centre = smooth(
      (width * 0.48 - Math.abs(position.getX(vertex) - centreX)) / (width * 0.14)
    );
    const weight = position.getY(vertex) >= KIT_TOP ? front * centre : 0;
    const targetZ = contactZ - (position.getY(vertex) - KIT_TOP) * slope;
    position.setZ(vertex, z + (targetZ - z) * weight);
    const cap = normal.getZ(vertex) > 0.12 && weight > 0;
    if (cap) {
      normal.setXYZ(
        vertex,
        normal.getX(vertex) * (1 - weight),
        normal.getY(vertex) * (1 - weight) + (slope / planeLength) * weight,
        normal.getZ(vertex) * (1 - weight) + (1 / planeLength) * weight
      );
    }
    // The entire central plane has the same finish; only its side perimeter fades the reflection.
    const length = Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
    const side = smooth((0.85 - Math.abs(normal.getX(vertex)) / Math.max(1e-8, length)) / 0.3);
    const gain = 1 + (cap ? 2.8 * weight * side : 0);
    colors.fill(gain, vertex * 3, vertex * 3 + 3);
  }
  position.needsUpdate = normal.needsUpdate = true;
  geometry.normalizeNormals();
  const index = geometry.getIndex();
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const top: number[] = [];
  const body: number[] = [];
  const count = index?.count ?? position.count;
  const at = (vertex: number) => index?.getX(vertex) ?? vertex;
  for (let triangle = 0; triangle < count; triangle += 3) {
    const a = at(triangle),
      b = at(triangle + 1),
      c = at(triangle + 2);
    const ny = (normal.getY(a) + normal.getY(b) + normal.getY(c)) / 3;
    const nz = (normal.getZ(a) + normal.getZ(b) + normal.getZ(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const raised = Math.max(position.getY(a), position.getY(b), position.getY(c)) > KIT_TOP;
    const cap = raised && nz > 0.12 && z > frontZ - depth * 0.4;
    // One cap finish: switching to the brighter, bumped body mid-bevel creates a second grey band.
    (ny > 0.25 || cap ? top : body).push(a, b, c);
  }
  geometry.setIndex(new Uint32BufferAttribute([...top, ...body], 1));
  geometry.clearGroups();
  geometry.addGroup(0, top.length, 0);
  geometry.addGroup(top.length, body.length, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Keep the painted top and its finger digits; the physical cap gain lifts only its dark base.
  return geometry;
}
