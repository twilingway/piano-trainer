// @vitest-environment happy-dom
import { Container, Matrix, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { RoadLayer } from "./RoadLayer";
import type { EnergySource } from "./noteEnergy";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";
import { CAMERA_PRESETS, PANEL_EDGE, worldCamera } from "./worldCamera";
import { noteProjectionCamera } from "./noteProjectionCamera";
import { createNoteLaneProjection } from "./noteLaneProjection";

function fixture() {
  const frame = new ThreeRoadFrame();
  frame.add(400, 100, 300, 44, 0x20df90, 1, 400, worldCamera(800, 600, undefined, PANEL_EDGE));
  const three = {
    drawsRoad: true,
    setEnergy: vi.fn(),
    setRoadFrame: vi.fn(),
    clearEnergy: vi.fn()
  };
  // Exercise real timing and snapshot wiring without constructing GPU resources.
  const internals = Object.assign(Object.create(RoadLayer.prototype) as object, {
    size: { width: 800, height: 400 },
    nativeRoad: frame,
    three,
    road: { renderable: true },
    glows: { renderable: true },
    staff: { container: new Container() },
    renderer: { render: vi.fn() },
    keysTexture: Texture.EMPTY,
    keysShift: new Matrix(),
    glass: { end: vi.fn() },
    sparks: { draw: vi.fn() },
    clock: 10,
    plasmaClock: 2,
    drawHorizon: vi.fn(),
    moveSparks: vi.fn()
  });
  const layer = internals as unknown as RoadLayer;
  const lane = new Container();
  const keys = new Container();
  return {
    layer,
    internals,
    frame,
    three,
    draw: (delta: number) => {
      layer.draw(lane, keys, [], [], delta);
    }
  };
}

describe("road decorative time", () => {
  it("keeps shader boiling alive on paused energy while the note geometry and flame time stay fixed", () => {
    const { layer, internals, frame, three, draw } = fixture();
    const sources: readonly EnergySource[] = [
      { id: "held", pitch: 60, color: 0x20df90, strength: 1, progress: 1, sounding: true }
    ];
    const geometry = structuredClone(frame.notes);
    layer.endNotes();
    expect(three.setRoadFrame).toHaveBeenCalledWith(frame);

    layer.setEnergy(sources, 0);
    draw(0.016);
    expect(frame.visualTime).toBeCloseTo(10.016);
    layer.setEnergy(sources, 0);
    draw(0.016);
    expect(frame.visualTime).toBeCloseTo(10.032);
    expect(internals.plasmaClock).toBe(2);
    expect(three.setEnergy).toHaveBeenLastCalledWith(sources, 0);
    expect(frame.notes).toEqual(geometry);
    expect(frame.noteCount).toBe(1);
  });

  it("advances energy only by its supplied delta, independently of shader time", () => {
    const { layer, internals, frame, draw } = fixture();
    layer.setEnergy([], 0.016);
    draw(0.032);
    expect(frame.visualTime).toBeCloseTo(10.032);
    expect(internals.plasmaClock).toBeCloseTo(2.016);
    layer.setEnergy([], 0);
    draw(0);
    expect(frame.visualTime).toBeCloseTo(10.032);
    expect(internals.plasmaClock).toBeCloseTo(2.016);
  });
});

describe("raised native note shell wiring", () => {
  it.each(["direct", "perspective"] as const)(
    "keeps black labels, body and consumed anchors on one lane in %s",
    (projection) => {
      const keyboard = worldCamera(800, 600, CAMERA_PRESETS.top);
      const camera = noteProjectionCamera(keyboard, projection, 600);
      const lane = createNoteLaneProjection(camera, keyboard, 34, 800, 800);
      const frame = new ThreeRoadFrame();
      const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
        camera,
        blackLane: lane,
        keyHeights: new Map([[400, 34]]),
        projection: camera.road,
        size: { width: 800, height: 400 },
        pan: 32,
        three: { on: true, drawsRoad: true },
        nativeRoad: frame
      }) as unknown as RoadLayer;
      const contact = road.notePlace(400, 400);
      const key = keyboard.project(keyboard.sourceX(400 - 32), 34, 142);
      expect(contact?.x).toBeCloseTo(key.x, 9);
      expect(contact?.y).toBeCloseTo(key.y, 9);
      expect(road.noteLaneY(400)).toBe(34);
      road.drawHold(400, 100, 300, 26, 0xffcf32, 1, 2, "black");
      road.addTrailAnchor(400, 26, 0xffcf32, 1);
      expect(frame.notes[0]?.lane).toBe(lane);
      expect(frame.trailAnchors[0]?.lane).toBe(lane);
      expect(frame.notes[0]?.bottom).toBeGreaterThan(camera.near.z);
    }
  );
});
