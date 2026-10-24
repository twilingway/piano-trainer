// @vitest-environment happy-dom
import { type Camera, Group, OrthographicCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { worldCamera } from "../worldCamera";
import { DEFAULT_PROJECTION_PARAMETERS } from "../stylizedProjection";
import type { KeyBox } from "./keyBoxes";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import { StylizedProjectionLayer } from "./StylizedProjectionLayer";

function fixture() {
  const boxes: KeyBox[] = Array.from({ length: 88 }, (_, index) => ({
    pitch: index + 21,
    black: false,
    metric: true,
    x: (index - 44) * 20,
    width: 18,
    bottom: 0,
    top: 22,
    front: 0,
    back: 149.1938,
    uv: { u0: 0, u1: 0, v0: 0, v1: 0 }
  }));
  const hinges = boxes.map((box) => ({ pitch: box.pitch, hinge: new Group() }));
  const camera = new OrthographicCamera(-1200, 1200, 1200, -200, 1, 5000);
  camera.position.z = 1000;
  camera.updateMatrixWorld();
  const frame = new ThreeRoadFrame();
  frame.noteProjection = { ...DEFAULT_PROJECTION_PARAMETERS, mode: "stylizedProjection" };
  const labels = [{ renderable: true }, { renderable: true }];
  frame.legacyLabels = labels;
  const layer = new StylizedProjectionLayer();
  const prepare = (cam: Camera = camera, enabled = true) =>
    layer.prepare(
      frame,
      boxes,
      hinges,
      cam,
      { width: 1440, height: 900 },
      worldCamera(1440, 900),
      enabled
    );
  return { layer, prepare, labels, frame, camera };
}

describe("projection composition lifecycle", () => {
  it("hides legacy labels only after a valid mapping and restores them on legacy switch", () => {
    const view = fixture();
    expect(view.prepare()).toBe(true);
    expect(view.labels.every((label) => !label.renderable)).toBe(true);
    const renderer = { clearDepth: vi.fn(), render: vi.fn() };
    view.layer.draw(renderer as never);
    expect(renderer.render).toHaveBeenCalledOnce();
    view.frame.noteProjection = DEFAULT_PROJECTION_PARAMETERS;
    expect(view.prepare()).toBe(false);
    expect(view.labels.every((label) => label.renderable)).toBe(true);
    renderer.render.mockClear();
    view.layer.draw(renderer as never);
    expect(renderer.render).not.toHaveBeenCalled();
    view.layer.dispose();
  });
  it("keeps legacy available for a reversed camera and for hidden/non-native keys", () => {
    const view = fixture();
    expect(view.prepare()).toBe(true);
    view.camera.position.z = -1000;
    view.camera.lookAt(0, 0, 0);
    view.camera.updateMatrixWorld();
    expect(view.prepare()).toBe(false);
    expect(view.labels.every((label) => label.renderable)).toBe(true);
    expect(view.layer.requested).toBe(true);
    expect(view.prepare(view.camera, false)).toBe(false);
    expect(view.layer.requested).toBe(false);
    view.layer.dispose();
  });
  it("returns label ownership when disposed while the stylized mode is active", () => {
    const view = fixture();
    expect(view.prepare()).toBe(true);
    view.layer.dispose();
    expect(view.labels.every((label) => label.renderable)).toBe(true);
  });
  it("restores labels synchronously when the host stops native rendering without another frame", () => {
    const view = fixture();
    view.prepare();
    view.layer.suspend();
    expect(view.labels.every((label) => label.renderable)).toBe(true);
    expect(view.layer.requested).toBe(false);
    expect(view.layer.geometryOnly).toBe(false);
    view.layer.dispose();
  });
  it("suppresses effects only for an effective geometry-only mapping", () => {
    const view = fixture();
    view.frame.noteProjection = { ...view.frame.noteProjection, geometryOnly: true };
    view.prepare();
    expect(view.layer.geometryOnly).toBe(true);
    view.prepare(view.camera, false);
    expect(view.layer.geometryOnly).toBe(false);
    view.layer.dispose();
  });
  it("draws background separately before opaque keyboard colour", () => {
    const view = fixture();
    view.prepare();
    const renderer = { render: vi.fn(), clearDepth: vi.fn() };
    view.layer.drawBackground(renderer as never);
    view.layer.draw(renderer as never);
    const background = renderer.render.mock.calls[0]?.[0] as { children: unknown[] };
    const overlay = renderer.render.mock.calls[1]?.[0] as { children: unknown[] };
    expect(background.children).toHaveLength(1);
    expect(overlay.children).toHaveLength(4);
    view.layer.dispose();
  });
});
