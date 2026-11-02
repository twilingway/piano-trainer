import { DataTexture, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { applyNativeKeyFinish } from "./nativeKeyFinish";

describe("native key finish coefficients", () => {
  it.each(["white", "black"] as const)(
    "tints %s from the source and restores its exact dim finish",
    (kind) => {
      const map = new DataTexture();
      const source = new MeshStandardMaterial({
        map,
        roughness: kind === "white" ? 0.36 : 0.78,
        metalness: 0
      });
      source.color.setRGB(0.92, 0.94, 0.98);
      const original = source.color.clone();
      const top = source.clone(),
        body = source.clone();
      applyNativeKeyFinish(top, source, kind, "top", false);
      applyNativeKeyFinish(body, source, kind, "body", false);
      const bright = [top, body].map((material) => ({
        color: material.color.clone(),
        roughness: material.roughness
      }));
      for (const material of [top, body]) {
        expect(material.color).not.toEqual(original);
        expect(material.color.toArray().every((value) => Number.isFinite(value) && value > 0)).toBe(
          true
        );
        expect(material.roughness).not.toBe(source.roughness);
        expect(material.roughness).toBeGreaterThan(0);
        expect(material.roughness).toBeLessThanOrEqual(1);
      }
      expect(body.roughness).toBeGreaterThan(top.roughness);
      for (let cycle = 0; cycle < 8; cycle++) {
        for (const [surface, material] of [
          ["top", top],
          ["body", body]
        ] as const) {
          applyNativeKeyFinish(material, source, kind, surface, false);
          const first = bright[surface === "top" ? 0 : 1];
          expect(material.color).toEqual(first?.color);
          expect(material.roughness).toBe(first?.roughness);
          applyNativeKeyFinish(material, source, kind, surface, false);
          expect(material.color).toEqual(first?.color);
          expect(material.roughness).toBe(first?.roughness);
          applyNativeKeyFinish(material, source, kind, surface, true);
          expect(material.color).toEqual(original);
          expect(material.roughness).toBe(source.roughness);
          expect(material.map).toBe(map);
          expect(material.metalness).toBe(0);
        }
      }
      expect(source.color).toEqual(original);
      expect(source.roughness).toBe(kind === "white" ? 0.36 : 0.78);
      top.dispose();
      body.dispose();
      source.dispose();
      map.dispose();
    }
  );
});
