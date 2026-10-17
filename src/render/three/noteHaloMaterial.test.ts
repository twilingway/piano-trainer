import { runInNewContext } from "node:vm";
import { AdditiveBlending, Matrix4, OrthographicCamera, PerspectiveCamera, Vector4 } from "three";
import { describe, expect, it } from "vitest";
import { createNoteHaloMaterial } from "./noteHaloMaterial";

const material = createNoteHaloMaterial();

function smoothstep(lower: number, upper: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - lower) / (upper - lower)));
  return t * t * (3 - 2 * t);
}

/** Execute the shader's scalar policy itself, rather than a separate TypeScript copy. */
function scalar(name: string): (...args: number[]) => number {
  const match = new RegExp(`float ${name}\\(([^)]*)\\) \\{([^}]+)\\}`).exec(material.vertexShader);
  if (!match) throw new Error(`Missing shader policy ${name}`);
  const parameters = (match[1] ?? "").replaceAll("float ", "");
  return runInNewContext(
    `(function(${parameters}) {${(match[2] ?? "").replaceAll("float ", "let ")}})`,
    { smoothstep, min: Math.min, max: Math.max }
  ) as (...args: number[]) => number;
}

const nearFade = scalar("haloNearFade");
const sizeFade = scalar("haloSizeFade");
const radius = scalar("haloRadius");
const margin = scalar("haloMargin");

function clip(depth: number, near = 1): Vector4 {
  const camera = new PerspectiveCamera(50, 16 / 9, near, 10000);
  return new Vector4(0, 0, -depth, 1).applyMatrix4(camera.projectionMatrix);
}

function fade(depth: number, width = 24, near = 1): number {
  const point = clip(depth, near);
  return nearFade(point.z, point.w, width, 20000 / (10000 - near));
}

describe("near-camera note halo", () => {
  it.each([0.5, 1, 10, 100])("fades continuously to zero at the real near plane %s", (near) => {
    const samples = [200, 100, 50, 20, 5, 1, 0.1, 0].map((gap) => fade(near + gap, 24, near));
    expect(samples[0]).toBe(1);
    expect(samples.at(-1)).toBeCloseTo(0, 12);
    samples.forEach((value, index) => {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(samples[Math.max(0, index - 1)] ?? 1);
    });
    expect(fade(near - 0.01, 24, near)).toBe(0);
    expect(fade(-100, 24, near)).toBe(0);
    expect(Math.abs(fade(near + 0.001, 24, near) - fade(near - 0.001, 24, near))).toBeLessThan(
      1e-8
    );
  });

  it("rejects a tilted long note when one corner crosses near, even if its centre is far", () => {
    const camera = new PerspectiveCamera(50, 1.6, 1, 10000);
    const transform = new Matrix4().makeRotationY(Math.PI / 3);
    transform.setPosition(0, 0, -200);
    const gaps = [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => {
        const corner = new Vector4(x * 12, 0, z * 200, 1)
          .applyMatrix4(transform)
          .applyMatrix4(camera.projectionMatrix);
        return nearFade(corner.z, corner.w, 24, 20000 / 9999);
      })
    );
    expect(fade(200)).toBe(1);
    expect(Math.min(...gaps)).toBe(1);
    transform.setPosition(0, 0, -50);
    const crossing = new Vector4(-12, 0, 200, 1)
      .applyMatrix4(transform)
      .applyMatrix4(camera.projectionMatrix);
    expect(nearFade(crossing.z, crossing.w, 24, 20000 / 9999)).toBe(0);
    const shader = material.vertexShader;
    expect(shader.indexOf("nearFade <= 0.0")).toBeLessThan(shader.indexOf("vQ0 = c0.xy / c0.w"));
    expect(shader).not.toContain("max(c0.w");
  });

  it("retains orthographic halos and uses the same world-distance fade", () => {
    const camera = new OrthographicCamera(-500, 500, 500, -500, 5, 50000);
    const scale = Math.abs(
      camera.projectionMatrix.elements[10] + camera.projectionMatrix.elements[11]
    );
    for (const depth of [4, 5, 6, 20, 40, 100, 1000]) {
      const point = new Vector4(0, 0, -depth, 1).applyMatrix4(camera.projectionMatrix);
      expect(nearFade(point.z, point.w, 24, scale)).toBeCloseTo(fade(depth, 24, 5), 10);
    }
  });

  it("preserves normal distant halos and caps oversized projected glows smoothly", () => {
    expect(fade(1000)).toBe(1);
    expect(sizeFade(80, 900)).toBe(1);
    expect(radius(80, 900)).toBe(16);
    expect(margin(80, 900)).toBe(48);
    for (const screen of [1, 320, 900, 2160]) {
      let previous = 1;
      for (let width = screen * 0.4; width <= screen * 2; width += screen * 0.01) {
        const alpha = sizeFade(width, screen);
        expect(alpha).toBeLessThanOrEqual(previous);
        expect(previous - alpha).toBeLessThan(0.04);
        expect(radius(width, screen)).toBeLessThanOrEqual(Math.max(1, screen * 0.06));
        expect(margin(width, screen)).toBeLessThanOrEqual(Math.max(2, screen * 0.18));
        previous = alpha;
      }
      expect(sizeFade(screen * 1e8, screen)).toBe(0);
    }
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(AdditiveBlending);
  });
});
