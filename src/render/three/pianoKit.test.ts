import { readFileSync } from "node:fs";
import { BoxGeometry, Mesh } from "three";
import type { BufferGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { KIT_DEPTH, roadContactBoard, splitUp, whitePart } from "./pianoKit";
import { PANEL_EDGE } from "../worldCamera";

describe("whitePart", () => {
  it("cuts the white key where a black one stands beside it", () => {
    expect(whitePart(false, true)).toBe("white-cut-right"); // C
    expect(whitePart(true, true)).toBe("white-cut-both"); // D
    expect(whitePart(true, false)).toBe("white-cut-left"); // E
    expect(whitePart(false, false)).toBe("white-full");
  });
});

describe("native road contact board", () => {
  it("drops rear caps and bevels without changing the shared source or its flat front", () => {
    const source = new BoxGeometry(1, 2, 2).translate(0, 0, -1);
    const sourcePosition = source.getAttribute("position");
    const original = Array.from(sourcePosition.array);
    const board = roadContactBoard(source, 0);
    const position = board.getAttribute("position");
    const normal = board.getAttribute("normal");
    expect(position.count).toBe(9);
    expect(board.getIndex()).toBeNull();
    for (let vertex = 0; vertex < position.count; vertex++) {
      expect(position.getZ(vertex)).toBe(0);
      expect(position.getY(vertex)).toBeLessThanOrEqual(0);
      expect(normal.getY(vertex)).toBe(0);
      expect(normal.getZ(vertex)).toBe(1);
    }
    expect(board.boundingBox?.min.y).toBe(-1);
    expect(board.boundingBox?.max.y).toBe(0);
    const uv = board.getAttribute("uv");
    for (let vertex = 0; vertex < position.count; vertex++)
      if (position.getY(vertex) === 0) expect(uv.getY(vertex)).toBeCloseTo(0.5);
    let area = 0;
    for (let vertex = 0; vertex < position.count; vertex += 3) {
      const ax = position.getX(vertex),
        ay = position.getY(vertex);
      const bx = position.getX(vertex + 1),
        by = position.getY(vertex + 1);
      const cx = position.getX(vertex + 2),
        cy = position.getY(vertex + 2);
      area += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    }
    expect(area).toBeCloseTo(1);
    expect(source.getIndex()?.count).toBe(36);
    expect(Array.from(sourcePosition.array)).toEqual(original);
    board.dispose();
    source.dispose();
  });

  it("keeps the actual GLB front panel and no geometry behind the road's contact halfspace", async () => {
    const data = new Uint8Array(readFileSync("public/models/piano-kit.glb")).buffer;
    const gltf = await new GLTFLoader().parseAsync(data, "");
    const source = gltf.scene.getObjectByName("board");
    if (!(source instanceof Mesh)) throw new Error("missing board in piano kit");
    const geometry = source.geometry as BufferGeometry;
    const before = geometry.getIndex()?.count;
    const contactZ = -PANEL_EDGE.z / KIT_DEPTH;
    const board = roadContactBoard(geometry, contactZ);
    const position = board.getAttribute("position");
    const normal = board.getAttribute("normal");
    expect(position.count).toBe(9);
    for (let vertex = 0; vertex < position.count; vertex++) {
      expect(position.getZ(vertex)).toBeGreaterThanOrEqual(contactZ - 1e-7);
      expect(position.getZ(vertex)).toBeCloseTo(contactZ, 7);
      expect(position.getY(vertex)).toBeLessThanOrEqual(0);
      expect(normal.getZ(vertex)).toBe(1);
    }
    expect(board.boundingBox?.min.y).toBeLessThan(-0.04);
    expect(board.boundingBox?.max.y).toBe(0);
    expect(geometry.getIndex()?.count).toBe(before);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.y).toBeGreaterThan(0.023);
    expect(before).toBeGreaterThan(position.count);
    board.dispose();
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const mesh = node as Mesh;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
  });
});

describe("splitUp", () => {
  it("puts the upward faces first as group 0", () => {
    const geometry = splitUp(new BoxGeometry(1, 1, 1));
    expect(geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 30, materialIndex: 1 }
    ]);
  });

  it("drops the upward faces", () => {
    const geometry = splitUp(new BoxGeometry(1, 1, 1), true);
    expect(geometry.getIndex()?.count).toBe(30);
  });
});
