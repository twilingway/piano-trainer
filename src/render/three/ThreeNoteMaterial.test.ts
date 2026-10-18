import { runInNewContext } from "node:vm";
import { DoubleSide, PerspectiveCamera, Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { createNoteBodyMaterial } from "./ThreeNoteMaterial";
const material = createNoteBodyMaterial();
const smoothstep = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
function scalar(name: string): (...args: number[]) => number {
  const match = new RegExp(`float ${name}\\(([^)]*)\\) \\{([^}]+)\\}`).exec(
    material.fragmentShader
  );
  if (!match) throw Error("Missing volume shader policy " + name);
  return runInNewContext(
    `(function(${(match[1] ?? "").replaceAll("float ", "")}){${(match[2] ?? "").replaceAll("float ", "let ")}})`,
    {
      smoothstep,
      sqrt: Math.sqrt,
      max: Math.max,
      min: Math.min,
      mix: (a: number, b: number, t: number) => a + (b - a) * t
    }
  ) as (...args: number[]) => number;
}
describe("uniformly emissive note volume", () => {
  it("uses one translucent unlit shader with identical radiance on every physical face", () => {
    expect(material.lights).toBe(false);
    expect(material.side).toBe(DoubleSide);
    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.forceSinglePass).toBe(false);
    expect(material.toneMapped).toBe(false);
    const glow = scalar("noteGlow");
    expect(glow(0, 0)).toBe(0.88);
    expect(glow(1, 0)).toBe(2);
    expect(glow(0, -1)).toBeCloseTo(0.86);
    expect(material.fragmentShader).not.toContain("totalEmissiveRadiance");
    expect(material.fragmentShader).toContain("noteGlow(rim, flow)");
    expect(material.fragmentShader).not.toContain("vNormal");
    expect(material.fragmentShader).toContain("abs(vPoint.z)");
  });
  it("gives all twelve box edges the same thin emission, including long-note bottom edges", () => {
    const edge = scalar("noteEdgeDistance");
    const radius = 2.2;
    const bevel = 0.5;
    const corner = radius * (1 - Math.SQRT1_2);
    for (const halfLength of [10, 100, 2000]) {
      // Both caps: two long edges plus two ends each; q values are reflection invariant.
      expect(edge(-bevel * 0.5, bevel * 0.5, 10, halfLength, radius, bevel)).toBe(0);
      expect(edge(-bevel * 0.5, bevel * 0.5, 0, halfLength, radius, bevel)).toBe(0);
      expect(edge(-bevel * 0.5, bevel * 0.5, 10, 0, radius, bevel)).toBe(0);
      // A whole chamfer is no longer an opaque luminous band.
      expect(edge(-bevel, 0, 10, halfLength, radius, bevel)).toBeGreaterThan(0.3);
      expect(edge(0, bevel, 10, halfLength, radius, bevel)).toBeGreaterThan(0.3);
      // Four vertical corner lines connect the caps through the extrusion's side band.
      expect(edge(0, 1.8, corner, corner, radius, bevel)).toBeCloseTo(0, 6);
      // Neither cap center nor a side/end center becomes an opaque luminous band.
      expect(edge(-10, 0, 10, halfLength, radius, bevel)).toBeGreaterThan(0.75);
      expect(edge(0, 1.8, 0, halfLength, radius, bevel)).toBeGreaterThan(0.75);
      expect(edge(0, 1.8, 10, 0, radius, bevel)).toBeGreaterThan(0.75);
    }
  });
  it("keeps overlapping centers transparent and the outline coloured without writing depth", () => {
    const alpha = scalar("noteGlassAlpha");
    const center = alpha(0);
    expect(1 - (1 - center) ** 2).toBeCloseTo(0.106975);
    expect(1 - (1 - center) ** 4).toBeLessThan(0.21);
    expect(alpha(1)).toBeCloseTo(0.94);
    expect(material.fragmentShader).toContain("float lineWidth = max(0.18, aa * 0.65)");
    expect(material.depthWrite).toBe(false);
  });
  it("fades at the actual near plane and before a passing volume fills the screen", () => {
    const fade = scalar("noteVolumeFade");
    for (const near of [0.1, 1, 10]) {
      const camera = new PerspectiveCamera(48, 1.6, near, 25000);
      const p = camera.projectionMatrix.elements;
      for (const gap of [0, 0.001, 1, 10, 50]) {
        const point = new Vector4(0, 0, -(near + gap), 1).applyMatrix4(camera.projectionMatrix);
        const actualGap = (point.z + point.w) / Math.abs(p[10] + p[11]);
        const alpha = fade(point.w, actualGap, 24, 0.1);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
        if (gap === 0) expect(alpha).toBeCloseTo(0);
      }
    }
    expect(fade(-1, 100, 24, 1)).toBe(0);
    expect(fade(0, 100, 24, 1)).toBe(0);
    expect(fade(1000, 100, 24, 50)).toBe(1);
    expect(fade(1, 100, 24, 2)).toBe(0);
    expect(fade(1, 100, 24, 1e6)).toBe(0);
    expect(material.fragmentShader.indexOf("clipW <= 0.0")).toBeLessThan(
      material.fragmentShader.indexOf("projectedWidth / clipW")
    );
  });
});
