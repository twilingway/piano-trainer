import { describe, expect, it } from "vitest";
import { worldCamera, PANEL_EDGE } from "../worldCamera";
import { flatNoteMaskMetrics } from "./ThreeFlatRoadNotes";
import { ThreeRoadFrame } from "./ThreeRoadFrame";

describe("Three road visual snapshot", () => {
  const camera = worldCamera(1440, 900, undefined, PANEL_EDGE);

  it("keeps bounded hit-line anchors separate from note bodies and reuses them after reset", () => {
    const frame = new ThreeRoadFrame();
    frame.addTrailAnchor(740, 44, 0xff0060, 0.8, camera);
    const first = frame.trailAnchors[0];
    expect(first).toEqual({
      x: 10,
      top: PANEL_EDGE.z,
      bottom: PANEL_EDGE.z,
      width: 22,
      color: 0xff0060,
      alpha: 0.8
    });
    expect(frame.noteCount).toBe(0);
    expect(frame.trailAnchorCount).toBe(1);
    frame.begin();
    expect(frame.trailAnchorCount).toBe(0);
    frame.addTrailAnchor(760, 26, 0x00ff60, 1, camera);
    expect(frame.trailAnchors[0]).toBe(first);
    for (let index = 0; index < 100; index++) frame.addTrailAnchor(760, 26, 0x00ff60, 1, camera);
    expect(frame.trailAnchorCount).toBe(88);
    frame.clear();
    expect(frame.trailAnchorCount).toBe(0);
    frame.addTrailAnchor(NaN, 26, 0x00ff60, 1, camera);
    frame.addTrailAnchor(760, 0, 0x00ff60, 1, camera);
    expect(frame.trailAnchorCount).toBe(0);
  });

  it("reuses note storage and removes consumed durations without retaining previous frames", () => {
    const frame = new ThreeRoadFrame();
    frame.add(720, 100, 600, 44, 0x00df50, 1, 600, camera);
    const note = frame.notes[0];
    expect(note?.bottom).toBe(PANEL_EDGE.z);
    frame.begin();
    frame.add(740, 300, 600, 26, 0xff9400, 1, 600, camera);
    expect(frame.notes[0]).toBe(note);
    expect(note?.color).toBe(0xff9400);
    expect(note?.width).toBe(13);
    frame.begin();
    frame.add(740, 600, 600, 26, 0xff9400, 1, 600, camera);
    expect(frame.noteCount).toBe(0);
  });

  it("keeps the lava origin and identity stable as a clipped tail enters the road", () => {
    const frame = new ThreeRoadFrame();
    const span = camera.roadFarZ - camera.near.z;
    frame.add(720, -120, 300, 44, 0xc528f5, 1, 600, camera, 2, "held-1", 120);
    const clipped = frame.notes[0];
    expect(clipped?.textureOffset).toBeCloseTo(span * 0.2);
    const seed = clipped?.seed;
    frame.begin();
    frame.add(720, 0, 420, 44, 0xc528f5, 1, 600, camera, 2, "held-1", 0);
    expect(frame.notes[0]?.textureOffset).toBe(0);
    expect(frame.notes[0]?.seed).toBe(seed);
    frame.begin();
    frame.add(720, 0, 420, 44, 0xc528f5, 1, 600, camera, 2, "held-2", 0);
    expect(frame.notes[0]?.seed).not.toBe(seed);
  });

  it("anchors lava to the score tail through repeat gaps and the readable consumed tail", () => {
    const frame = new ThreeRoadFrame();
    const span = camera.roadFarZ - camera.near.z;
    const scale = span / 600;
    const worldAt = (sourceY: number) => camera.near.z + (600 - sourceY) * scale;
    // A repeat gap trims the displayed far edge by 12 px.
    frame.add(720, 112, 500, 44, 0xc528f5, 1, 600, camera, 2, "held", 12);
    const gap = frame.notes[0];
    expect((gap?.top ?? 0) + (gap?.textureOffset ?? 0)).toBeCloseTo(worldAt(100));
    // Near the hit line, readability extends the display behind the actual remaining tail.
    frame.begin();
    frame.add(720, 560, 600, 44, 0xc528f5, 1, 600, camera, 2, "held", -20);
    const consumed = frame.notes[0];
    expect(consumed?.textureOffset).toBeCloseTo(-20 * scale);
    expect((consumed?.top ?? 0) + (consumed?.textureOffset ?? 0)).toBeCloseTo(worldAt(580));
  });

  it("keeps simultaneous voices separate and carries measures in the same depth space", () => {
    const frame = new ThreeRoadFrame();
    frame.add(720, 0, 600, 44, 0xc528f5, 1, 600, camera);
    frame.add(720, 100, 300, 44, 0x00a9f5, 0.5, 600, camera);
    expect(frame.noteCount).toBe(2);
    expect(frame.notes[0]?.color).not.toBe(frame.notes[1]?.color);
    frame.beat(0, 600, camera);
    frame.beat(600, 600, camera);
    frame.beat(-1, 600, camera);
    expect(frame.beatCount).toBe(2);
    expect(frame.beats).toEqual([camera.roadFarZ, camera.near.z]);
    frame.visualTime = 12;
    frame.clear();
    expect(frame.noteCount).toBe(0);
    expect(frame.beatCount).toBe(0);
    expect(frame.visualTime).toBe(0);
  });
});

it("preserves source-pixel units for the shared baked perspective skin", () => {
  const camera = worldCamera(1440, 900, undefined, PANEL_EDGE);
  const frame = new ThreeRoadFrame();
  frame.add(720, 100, 600, 44, 0x00df50, 1, 600, camera);
  expect(frame.notes[0]?.materialUnitX).toBe(camera.params.sourceUnits ?? 0.5);
  expect(frame.notes[0]?.materialUnitZ).toBeCloseTo((camera.roadFarZ - camera.near.z) / 600);
});

it("measures a flat note's depth edges in on-screen picture pixels, not in long lane rows", () => {
  const camera = worldCamera(1440, 900, undefined, PANEL_EDGE);
  const frame = new ThreeRoadFrame();
  const plain = new ThreeRoadFrame();
  frame.flatPictureRows = 0.05;
  frame.add(720, 100, 600, 44, 0x00df50, 1, 600, camera);
  plain.add(720, 100, 600, 44, 0x00df50, 1, 600, camera);
  expect(frame.notes[0]?.materialUnitZ).toBeCloseTo(
    ((camera.roadFarZ - camera.near.z) / 600) * 0.05
  );
  // Only the picture's edges change: the note keeps its place and length on the road.
  expect(frame.notes[0]?.top).toBe(plain.notes[0]?.top);
  expect(frame.notes[0]?.bottom).toBe(plain.notes[0]?.bottom);
});

it("keeps a flat note's picture square to the world on a free field of any length", () => {
  const camera = worldCamera(1440, 900, undefined, PANEL_EDGE);
  const span = camera.roadFarZ - 150;
  const lane = { y: 22, depth: 150, scaleX: 1, offsetX: 0, offsetY: 0, width: 44, height: 0 };
  for (const far of [
    { x: 0, y: 22 + 450, z: -150 },
    { x: 0, y: 22, z: -150 - 59520 }
  ]) {
    const frame = new ThreeRoadFrame();
    frame.flatPictureRows = 0.05;
    frame.add(720, 100, 600, 44, 0x00df50, 1, 600, camera, 0, "", 0, {
      ...lane,
      freeFar: { ...far, x: camera.sourceX(720) }
    });
    const note = frame.notes[0];
    if (!note) throw new Error("no note");
    const route = Math.hypot(far.y - 22, far.z + 150);
    // A picture pixel along the route covers as much world as one across it.
    expect(((note.freeMaterialUnitZ ?? NaN) * route) / span).toBeCloseTo(note.materialUnitX ?? 0);
    // The standard road keeps the screen-measured rows.
    expect(note.materialUnitZ).toBeCloseTo((span / 600) * 0.05);
    const standard = { width: 0, depth: 0, capX: 0, capZ: 0 };
    const free = { ...standard };
    flatNoteMaskMetrics(note, "face", standard);
    flatNoteMaskMetrics(note, "face", free, true);
    expect(standard.capZ / (note.materialUnitZ ?? 1)).toBeCloseTo(
      standard.capX / (note.materialUnitX ?? 1)
    );
    // On the route the corner spans as much world along as across.
    expect((free.capZ * route) / span).toBeCloseTo(free.capX);
  }
});
