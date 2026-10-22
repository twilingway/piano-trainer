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
  it("keeps subpixel edges continuous across pixel phases and projection scales", () => {
    const coverage = scalar("noteEdgeCoverage");
    // Pixel pairs straddling the line can have equal unsigned distances, while
    // their signed offset still spans a whole pixel. The latter defines AA.
    for (const pixelWidth of [0.2, 0.5, 1, 4, 20]) {
      for (const phase of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const a = phase * pixelWidth;
        const b = a + pixelWidth;
        const signedWidth = Math.abs(b - a);
        expect(coverage(Math.abs(a), signedWidth)).toBe(1);
        expect(coverage(3 * pixelWidth + 0.18, signedWidth)).toBe(0);
      }
    }
    expect(coverage(0.5, 1)).toBe(1);
    expect(coverage(0.5, 0)).toBe(0);
    // Both independent edge families must differentiate before the distance fold.
    expect(material.fragmentShader).toContain(
      "noteEdgeCoverage(length(capOffset), length(fwidth(capOffset)))"
    );
    expect(material.fragmentShader).toContain(
      "noteEdgeCoverage(length(cornerOffset), length(fwidth(cornerOffset)))"
    );
    expect(material.fragmentShader).not.toContain("fwidth(edgeDistance)");
  });
  it("keeps overlapping centers transparent and the outline coloured without writing depth", () => {
    const alpha = scalar("noteGlassAlpha");
    const center = alpha(0);
    expect(1 - (1 - center) ** 2).toBeCloseTo(0.2604);
    expect(1 - (1 - center) ** 4).toBeLessThan(0.46);
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
