import { BoxGeometry, Camera, Group, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { drawKeyboardCasePasses, invalidateKeyboardCasePasses } from "./keyboardCasePasses";

function fixture() {
  const scene = new Scene(),
    road = new Group(),
    keys = new Group(),
    body = new Group();
  const mesh = () => new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const note = mesh(),
    key = mesh(),
    rail = mesh(),
    floor = mesh(),
    hand = mesh();
  body.add(rail);
  keys.add(body, key, hand);
  road.add(note);
  scene.add(keys, road, floor);
  const roadCamera = new Camera(),
    keyboardCamera = new Camera();
  const states: unknown[] = [];
  const renderer = {
    clearDepth: vi.fn(),
    render: vi.fn((_scene: Scene, camera: Camera) => {
      states.push({
        camera,
        note: note.visible && road.visible,
        key: key.visible && keys.visible,
        hand: hand.visible && keys.visible,
        rail: rail.visible && body.visible && keys.visible,
        color: rail.material.colorWrite,
        floor: floor.visible
      });
    })
  };
  const draw = () => {
    drawKeyboardCasePasses(renderer, scene, road, keys, body, roadCamera, keyboardCamera);
  };
  return {
    scene,
    road,
    keys,
    body,
    note,
    key,
    rail,
    floor,
    hand,
    renderer,
    states,
    roadCamera,
    keyboardCamera,
    draw
  };
}

describe("case and road composition", () => {
  it("keeps the complete case behind the contact, then restores physical case depth for hands", () => {
    const v = fixture();
    v.draw();
    expect(v.states).toEqual([
      {
        camera: v.keyboardCamera,
        note: false,
        key: false,
        hand: false,
        rail: true,
        color: true,
        floor: true
      },
      {
        camera: v.roadCamera,
        note: true,
        key: false,
        hand: false,
        rail: false,
        color: true,
        floor: false
      },
      {
        camera: v.keyboardCamera,
        note: false,
        key: false,
        hand: false,
        rail: true,
        color: false,
        floor: true
      },
      {
        camera: v.keyboardCamera,
        note: false,
        key: true,
        hand: true,
        rail: false,
        color: true,
        floor: false
      }
    ]);
    expect(v.renderer.clearDepth).toHaveBeenCalledTimes(2);
    expect([
      v.rail.visible,
      v.key.visible,
      v.note.visible,
      v.floor.visible,
      v.hand.visible,
      v.body.visible
    ]).toEqual([true, true, true, true, true, true]);
    const traverse = vi.spyOn(v.scene, "traverse");
    v.draw();
    expect(traverse).not.toHaveBeenCalled();
    invalidateKeyboardCasePasses(v.scene);
    v.draw();
    expect(traverse).toHaveBeenCalledOnce();
  });

  it.each([1, 2, 3, 4])("restores visibility and colorWrite after a failure in pass%s", (pass) => {
    const v = fixture();
    let draws = 0;
    v.hand.visible = false;
    v.renderer.render.mockImplementation(() => {
      if (++draws === pass) throw new Error("GPU failed");
    });
    expect(v.draw).toThrow("GPU failed");
    expect(v.rail.material.colorWrite).toBe(true);
    expect([
      v.rail.visible,
      v.key.visible,
      v.note.visible,
      v.floor.visible,
      v.hand.visible,
      v.body.visible
    ]).toEqual([true, true, true, true, false, true]);
  });

  it("keeps transparent effects and the fullscreen blackout in the final physical pass", () => {
    const v = fixture();
    const curtain = new Mesh(
      new BoxGeometry(),
      new MeshStandardMaterial({ transparent: true, depthTest: false, depthWrite: false })
    );
    curtain.renderOrder = 10000;
    v.scene.add(curtain);
    const draws: boolean[] = [];
    v.renderer.render.mockImplementation(() => {
      draws.push(curtain.visible);
    });
    v.draw();
    expect(draws).toEqual([false, false, false, true]);
    expect(curtain.renderOrder).toBe(10000);
  });
});
