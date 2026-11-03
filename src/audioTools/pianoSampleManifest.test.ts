import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pianoSampleManifest, pianoSampleSizes } from "./pianoSampleManifest";

describe("piano sample size manifest", () => {
  it("measures all 120 published samples with exact body sizes", () => {
    const sizes = pianoSampleSizes(resolve("public"));
    expect(Object.keys(sizes)).toHaveLength(120);
    for (const [name, size] of Object.entries(sizes))
      expect(size).toBe(statSync(resolve("public/audio/salamander-v1", name)).size);
    expect(
      Object.entries(sizes)
        .filter(([name]) => name.endsWith("v10.mp3"))
        .reduce((sum, [, size]) => sum + size, 0)
    ).toBe(2926230);
  });

  it("exposes the same manifest through the virtual module for any configured public root", () => {
    const plugin = pianoSampleManifest();
    if (
      typeof plugin.configResolved !== "function" ||
      typeof plugin.resolveId !== "function" ||
      typeof plugin.load !== "function"
    )
      throw new Error("Expected manifest plugin hooks");
    Reflect.apply(plugin.configResolved, {}, [{ publicDir: resolve("public") }]);
    const id: unknown = Reflect.apply(plugin.resolveId, {}, ["virtual:piano-sample-sizes"]);
    expect(Reflect.apply(plugin.load, {}, [id])).toBe(
      `export default ${JSON.stringify(pianoSampleSizes(resolve("public")))};`
    );
    expect(Reflect.apply(plugin.resolveId, {}, ["unrelated"])).toBeUndefined();
    expect(Reflect.apply(plugin.load, {}, ["unrelated"])).toBeUndefined();
  });
});
