// @vitest-environment happy-dom
import { Group, Mesh, ShaderMaterial } from "three";
import { expect, it } from "vitest";
import { ThreeRoadNotes } from "./ThreeRoadNotes";
import { ThreeRoadFrame } from "./ThreeRoadFrame";
import { drawRoadNoteAppearance } from "./drawRoadNoteAppearance";

it("uses the projected baked skin only for flat style and restores unchanged full-3D resources", () => {
  const road = new Group();
  const native = new ThreeRoadNotes(4);
  road.add(native.group);
  const original = [...native.group.children];
  const frame = new ThreeRoadFrame();
  frame.notes.push({
    x: 20,
    top: 242,
    bottom: 142,
    width: 20,
    color: 0x00ccff,
    alpha: 0.8,
    pitch: 60
  });
  frame.noteCount = 1;
  let flat = drawRoadNoteAppearance(native, undefined, road, frame, 22, 142);
  expect(flat).toBeUndefined();
  expect(native.group.visible).toBe(true);
  frame.flatMaterial = true;
  flat = drawRoadNoteAppearance(native, flat, road, frame, 22, 142);
  expect(flat?.group.visible).toBe(true);
  expect(flat?.group.parent).toBe(road);
  expect(native.group.visible).toBe(false);
  const saved = flat;
  frame.flatMaterial = false;
  flat = drawRoadNoteAppearance(native, flat, road, frame, 22, 142);
  expect(flat).toBe(saved);
  expect(flat?.group.visible).toBe(false);
  expect(native.group.visible).toBe(true);
  expect(native.group.children).toEqual(original);
  flat?.dispose();
  native.dispose();
});

it("switches between filled volume, flat masks and legacy glass without replacing the road", () => {
  const road = new Group();
  const native = new ThreeRoadNotes(4);
  road.add(native.group);
  const frame = new ThreeRoadFrame();
  frame.notes.push({
    x: 20,
    top: 242,
    bottom: 142,
    width: 20,
    color: 0x00ccff,
    alpha: 0.8,
    pitch: 60
  });
  frame.noteCount = 1;
  const bodyMaterial = (): ShaderMaterial => {
    const object = native.group.children[0];
    const candidate: unknown = object instanceof Mesh ? object.material : undefined;
    if (!(candidate instanceof ShaderMaterial))
      throw new Error("Expected a single volume material");
    return candidate;
  };
  const glass = bodyMaterial();
  let flat = drawRoadNoteAppearance(native, undefined, road, frame, 22, 142);
  expect(bodyMaterial().transparent).toBe(false);
  frame.noteStyle = "flat";
  frame.flatMaterial = true;
  flat = drawRoadNoteAppearance(native, flat, road, frame, 22, 142);
  expect(native.group.visible).toBe(false);
  expect(flat?.group.visible).toBe(true);
  frame.noteStyle = "glass";
  frame.flatMaterial = false;
  flat = drawRoadNoteAppearance(native, flat, road, frame, 22, 142);
  expect(bodyMaterial()).toBe(glass);
  expect(native.group.visible).toBe(true);
  expect(flat?.group.visible).toBe(false);
  flat?.dispose();
  native.dispose();
});
