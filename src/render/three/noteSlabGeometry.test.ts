import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createNoteSlabGeometry, NOTE_SLAB_THICKNESS } from "./noteSlabGeometry";

describe("chamfered note slab geometry", () => {
  it.each([40, 400, 4000])(
    "retains flat caps, a narrow chamfer and a vertical front band at depth %s",
    (depth) => {
      const geometry = createNoteSlabGeometry(20, depth);
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const frontHeights: number[] = [];
      const topHeights: number[] = [];
      const chamferHeights: number[] = [];
      let bevelCount = 0;
      for (let index = 0; index < position.count; index++) {
        const x = normal.getX(index);
        const y = normal.getY(index);
        const z = normal.getZ(index);
        expect(Math.hypot(x, y, z)).toBeCloseTo(1);
        if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001 && z > 0.999)
          frontHeights.push(position.getY(index));
        if (y > 0.999) topHeights.push(position.getY(index));
        if (y > 0.5 && y < 0.9 && Math.hypot(x, z) > 0.5) {
          bevelCount++;
          chamferHeights.push(position.getY(index));
        }
      }
      expect(topHeights.length).toBeGreaterThan(20);
      expect(topHeights.every((height) => Math.abs(height - 1.8) < 0.0001)).toBe(true);
      expect(bevelCount).toBeGreaterThan(20);
      expect(Math.max(...chamferHeights) - Math.min(...chamferHeights)).toBeCloseTo(0.5);
      expect(Math.max(...frontHeights)).toBeCloseTo(1.3);
      expect(Math.min(...frontHeights)).toBeCloseTo(-1.3);
      expect(geometry.boundingBox?.min.toArray()).toEqual([-10, expect.closeTo(-1.8), -depth / 2]);
      expect(geometry.boundingBox?.max.toArray()).toEqual([10, expect.closeTo(1.8), depth / 2]);
      geometry.dispose();
    }
  );

  it("separates the planar corner radius from the shallow vertical bevel at every duration", () => {
    for (const depth of [40, 4000]) {
      const geometry = createNoteSlabGeometry(20, depth);
      const position = geometry.getAttribute("position");
      const corner = geometry.getAttribute("slabCorner");
      const arc = geometry.getAttribute("slabArc");
      const profile = geometry.getAttribute("slabProfile");
      const outerRadii: number[] = [];
      const topRadii: number[] = [];
      for (let index = 0; index < position.count; index++) {
        if (corner.getX(index) !== 1 || corner.getY(index) !== 1 || profile.getX(index) !== 0.5)
          continue;
        if (arc.getX(index) < 0.1 || arc.getX(index) > 0.9) continue;
        const radius = Math.hypot(
          position.getX(index) - 7.8,
          position.getZ(index) - (depth / 2 - 2.2)
        );
        if (profile.getZ(index) === 0) outerRadii.push(radius);
        else topRadii.push(radius);
      }
      expect(outerRadii.length).toBeGreaterThan(0);
      expect(topRadii.length).toBeGreaterThan(0);
      outerRadii.forEach((radius) => {
        expect(radius).toBeCloseTo(2.2, 3);
      });
      topRadii.forEach((radius) => {
        expect(radius).toBeCloseTo(1.7, 3);
      });
      geometry.dispose();
    }
  });

  it.each([0.02, 1, 40, 4000])(
    "is a closed outward-facing nondegenerate solid even at depth %s",
    (depth) => {
      const width = 20;
      const geometry = createNoteSlabGeometry(width, depth);
      const positions = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      const edges = new Map<string, number>();
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      const cross = new Vector3();
      const ab = new Vector3();
      const ac = new Vector3();
      let volume = 0;
      for (let index = 0; index < positions.count; index += 3) {
        a.fromBufferAttribute(positions, index);
        b.fromBufferAttribute(positions, index + 1);
        c.fromBufferAttribute(positions, index + 2);
        cross.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
        expect(cross.length()).toBeGreaterThan(0);
        expect(
          cross.normalize().dot(new Vector3().fromBufferAttribute(normals, index))
        ).toBeGreaterThan(0.999);
        volume += a.dot(new Vector3().crossVectors(b, c)) / 6;
        for (const [p, q] of [
          [a, b],
          [b, c],
          [c, a]
        ]) {
          if (!p || !q) throw new Error("missing edge");
          const points = [p.toArray().join(","), q.toArray().join(",")].sort();
          const key = points.join("|");
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect(volume).toBeGreaterThan(width * depth * width * NOTE_SLAB_THICKNESS * 0.5);
      expect([...edges.values()].every((count) => count === 2)).toBe(true);
      geometry.dispose();
    }
  );

  it("rejects invalid build dimensions before creating buffers", () => {
    expect(() => createNoteSlabGeometry(0, 20)).toThrow(RangeError);
    expect(() => createNoteSlabGeometry(20, Number.NaN)).toThrow(RangeError);
  });
});
