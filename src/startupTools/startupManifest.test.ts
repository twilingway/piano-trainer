import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStartupManifest } from "./startupManifest";

describe("startup build estimate", () => {
  let fixture = "";
  beforeEach(() => {
    fixture = mkdtempSync(join(tmpdir(), "piano-startup-manifest-"));
    mkdirSync(join(fixture, "public/models"), { recursive: true });
    writeFileSync(join(fixture, "public/models/keyboard88.glb"), new Uint8Array(40));
    writeFileSync(join(fixture, "public/models/optional-performer.glb"), new Uint8Array(500));
  });
  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it("counts the initial import graph, native startup and effects without unrelated lazy chunks", () => {
    const manifest = createStartupManifest(fixture, "/", {
      "entry.js": {
        type: "chunk",
        fileName: "entry.js",
        code: "entry",
        isEntry: true,
        imports: ["shared.js"]
      },
      "shared.js": { type: "chunk", fileName: "shared.js", code: "shared" },
      "stage.js": {
        type: "chunk",
        fileName: "stage.js",
        name: "ThreeStage",
        code: "stage",
        imports: ["shared.js"]
      },
      "lazy-course.js": { type: "chunk", fileName: "lazy-course.js", code: "course" },
      "app.css": { type: "asset", fileName: "app.css", source: "css" },
      "piano-mist-abcd.webp": {
        type: "asset",
        fileName: "piano-mist-abcd.webp",
        source: new Uint8Array(100)
      },
      "lesson-cover.webp": {
        type: "asset",
        fileName: "lesson-cover.webp",
        source: new Uint8Array(200)
      }
    });
    expect([...manifest.initial].sort()).toEqual(
      [
        "/app.css",
        "/entry.js",
        "/models/keyboard88.glb",
        "/piano-mist-abcd.webp",
        "/shared.js",
        "/stage.js"
      ].sort()
    );
    expect(manifest.initial.reduce((total, url) => total + (manifest.sizes[url] ?? 0), 0)).toBe(
      159
    );
    expect(manifest.sizes["/lazy-course.js"]).toBe(6);
    expect(manifest.sizes["/models/optional-performer.glb"]).toBe(500);
  });
});
