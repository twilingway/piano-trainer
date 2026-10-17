// @vitest-environment happy-dom
import { Container, Matrix, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { RoadLayer } from "./RoadLayer";
import type { EnergySource } from "./noteEnergy";
import { ThreeRoadFrame } from "./three/ThreeRoadFrame";
import { PANEL_EDGE, worldCamera } from "./worldCamera";

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
    held: new Map(),
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
