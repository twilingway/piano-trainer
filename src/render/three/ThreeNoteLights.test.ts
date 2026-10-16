import { Group, PointLight, Vector3 } from "three";
import type { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { EnergySource } from "../noteEnergy";
import { layoutKeyboard } from "../keyboardLayout";
import type { KeysScene } from "../PerspectiveKeyboardLayer";
import { DEFAULT_CAMERA, PANEL_EDGE, worldCamera } from "../worldCamera";
import { keyBoxes } from "./keyBoxes";
import { projectionMatrix, viewMatrix } from "./threeCamera";
import {
  NOTE_LIGHT_LIMIT,
  NoteLightSelection,
  noteLightEnergy,
  ThreeNoteLights
} from "./ThreeNoteLights";

function scene(pan = 0, scale = 1): KeysScene {
  return {
    faces: [...layoutKeyboard(1600, 21, 108).values()].map((key) => ({
      key,
      source: key.black ? { y: 0, height: 60 } : { y: 60, height: 40 }
    })),
    texture: { width: 1600, height: 100 } as Texture,
    camera: worldCamera(1280, 640, { ...DEFAULT_CAMERA, scale }, PANEL_EDGE),
    pan,
    offset: { x: 17, y: 11 },
    version: 1
  };
}

const source = (pitch: number, overrides: Partial<EnergySource> = {}): EnergySource => ({
  id: `note-${String(pitch)}`,
  pitch,
  color: 0xff0000,
  strength: 1,
  progress: 1,
  sounding: true,
  ...overrides
});

function selection(keys = scene()) {
  const selection = new NoteLightSelection();
  selection.layout(keyBoxes(keys));
  return { selection, camera: keys.camera };
}

describe("note light selection", () => {
  it("leaves distant notes dim and grows smoothly as they reach the hands", () => {
    const energy = (progress: number) => noteLightEnergy(source(60, { progress, sounding: false }));
    expect(energy(0)).toBe(0);
    expect(energy(0.7)).toBeLessThan(0.02);
    expect(energy(0.85)).toBeGreaterThan(energy(0.7));
    expect(energy(1)).toBeCloseTo(1);
    expect(noteLightEnergy(source(60, { strength: Number.NaN }))).toBe(0);
    expect(noteLightEnergy(source(60, { strength: -1 }))).toBe(0);
  });

  it("mixes two independent parts on one key and caps their total energy", () => {
    const { selection: picker, camera } = selection();
    const [sample] = picker.update(
      [
        source(60, { id: "left", color: 0xff0000, strength: 1 }),
        source(60, { id: "right", color: 0x0000ff, strength: 1 })
      ],
      camera
    );
    expect(sample?.red).toBeCloseTo(0.5);
    expect(sample?.blue).toBeCloseTo(0.5);
    expect(sample?.green).toBe(0);
    expect(sample?.energy).toBe(1.4);
    expect(picker.samples.filter((light) => light.energy > 0)).toHaveLength(1);
  });

  it("merges nearby chromatic notes while keeping separated notes local", () => {
    const keys = scene();
    const { selection: picker, camera } = selection(keys);
    const boxes = keyBoxes(keys);
    const c = boxes.find((box) => box.pitch === 60);
    const sharp = boxes.find((box) => box.pitch === 61);
    const samples = picker.update([source(60), source(61), source(72)], camera);
    expect(samples.filter((light) => light.energy > 0)).toHaveLength(2);
    expect(samples[0]?.x).toBeCloseTo(((c?.x ?? 0) + (sharp?.x ?? 0)) / 2);
    expect(samples[1]?.x).toBe(boxes.find((box) => box.pitch === 72)?.x);
  });

  it("selects at most eight strongest lights with a stable order and chord energy budget", () => {
    const { selection: picker, camera } = selection();
    const sources = Array.from({ length: 12 }, (_, index) => source(36 + index * 4));
    sources.push(source(96, { strength: 1.3 }));
    const first = picker.update(sources, camera).map((sample) => ({ ...sample }));
    const second = picker.update([...sources].reverse(), camera);
    expect(first).toEqual(second);
    expect(first).toHaveLength(NOTE_LIGHT_LIMIT);
    expect(first.reduce((sum, sample) => sum + sample.energy, 0)).toBeCloseTo(4.5);
    const boxes = keyBoxes(scene());
    expect(first[0]?.x).toBe(boxes.find((box) => box.pitch === 96)?.x);
    expect(first[1]?.x).toBe(boxes.find((box) => box.pitch === 36)?.x);
  });

  it.each([
    [0, 1],
    [210, 1.5]
  ])("projects lights with the keys through pan and scale (%s, %s)", (pan, scale) => {
    const keys = scene(pan, scale);
    const { selection: picker, camera } = selection(keys);
    const [sample] = picker.update([source(61, { sounding: false, progress: 0.9 })], camera);
    if (!sample) throw new Error("missing sample");
    const expectedDepth = camera.near.z + 0.1 * (camera.roadFarZ - camera.near.z);
    expect(-sample.z).toBeCloseTo(expectedDepth);
    const want = camera.project(sample.x - pan / 2, sample.y, -sample.z);
    const projected = new Vector3((sample.x - pan / 2) * scale, sample.y * scale, sample.z * scale)
      .applyMatrix4(viewMatrix(camera.params))
      .applyMatrix4(projectionMatrix(camera.params, 1280, 720, keys.offset));
    expect((projected.x + 1) * 640).toBeCloseTo(want.x + keys.offset.x);
    expect((1 - projected.y) * 360).toBeCloseTo(want.y + keys.offset.y);
    const [held] = picker.update([source(61, { progress: 0.1 })], camera);
    expect(held?.z).toBe(10);
    expect(held?.y).toBe(135);
  });

  it("ignores pitches outside the visible range and clears old results after layout", () => {
    const { selection: picker, camera } = selection();
    const storage = picker.samples;
    const first = storage[0];
    picker.update([source(60)], camera);
    picker.update([source(120)], camera);
    expect(storage.every((sample) => sample.energy === 0)).toBe(true);
    picker.layout([]);
    picker.update([source(60)], camera);
    expect(picker.samples).toBe(storage);
    expect(picker.samples[0]).toBe(first);
    expect(storage.every((sample) => sample.energy === 0)).toBe(true);
  });
});

describe("Three note light lifecycle", () => {
  it.each([1, 1.5])(
    "lights hands above the key fronts and keeps nearby coloured spill at scale %s",
    (scale) => {
      const keys = scene(0, scale);
      const pool = new ThreeNoteLights();
      pool.layout(keyBoxes(keys));
      for (let frame = 0; frame < 20; frame++)
        pool.update([source(60, { color: 0x0080ff })], keys.camera, 0.1);
      const first = pool.group.children[0] as PointLight;
      const boxes = keyBoxes(keys);
      const played = boxes.find((box) => box.pitch === 60);
      const neighbor = boxes.find((box) => box.pitch === 64);
      if (!played || !neighbor) throw new Error("missing test keys");
      expect(first.position.x).toBe(played.x);
      expect(first.position.y).toBe(135);
      expect(first.position.z).toBe(10);
      expect(first.color.r).toBe(0);
      expect(first.color.g).toBeCloseTo(128 / 255);
      expect(first.color.b).toBe(1);
      const neighborDistance = first.position.distanceTo(
        new Vector3(neighbor.x, neighbor.top, -71)
      );
      expect(neighborDistance * scale).toBeLessThan(first.distance);
      expect(first.distance).toBe(300 * scale);
      expect(first.intensity).toBeCloseTo(13000 * scale ** 2);
      pool.dispose();
    }
  );

  it("freezes positions, colours and brightness during pause, including a new source", () => {
    const keys = scene();
    const pool = new ThreeNoteLights();
    pool.layout(keyBoxes(keys));
    pool.update([source(60)], keys.camera, 0.1);
    const first = pool.group.children[0] as PointLight;
    const position = first.position.clone();
    const color = first.color.clone();
    const intensity = first.intensity;
    pool.update([source(72, { color: 0x0000ff })], keys.camera, 0);
    expect(first.intensity).toBe(intensity);
    expect(first.position).toEqual(position);
    expect(first.color).toEqual(color);
    pool.dispose();
  });

  it("clears current light immediately and keeps a same-id source dark while paused after reset", () => {
    const keys = scene();
    const pool = new ThreeNoteLights();
    pool.layout(keyBoxes(keys));
    const sameNote = source(60);
    pool.update([sameNote], keys.camera, 0.1);
    const lights = pool.group.children as PointLight[];
    expect(lights[0]?.intensity).toBeGreaterThan(0);
    pool.clear();
    expect(lights.every((light) => light.intensity === 0)).toBe(true);
    pool.update([sameNote], keys.camera, 0);
    expect(lights.every((light) => light.intensity === 0)).toBe(true);
    pool.update([sameNote], keys.camera, 0.016);
    expect(lights[0]?.intensity).toBeGreaterThan(0);
    expect(pool.group.children).toBe(lights);
    pool.dispose();
  });

  it("reuses eight shadowless lights, pauses and releases energy without replacing resources", () => {
    const keys = scene();
    const pool = new ThreeNoteLights();
    pool.layout(keyBoxes(keys));
    const lights = [...pool.group.children];
    expect(lights).toHaveLength(NOTE_LIGHT_LIMIT);
    expect(lights.every((light) => light instanceof PointLight && !light.castShadow)).toBe(true);
    pool.update([source(60)], keys.camera, 0.1);
    const first = lights[0] as PointLight;
    const intensity = first.intensity;
    expect(intensity).toBeGreaterThan(0);
    pool.update([], keys.camera, 0);
    expect(first.intensity).toBe(intensity);
    pool.update([], keys.camera, 0.1);
    expect(first.intensity).toBeLessThan(intensity);
    for (let frame = 0; frame < 20; frame++) pool.update([], keys.camera, 0.1);
    expect(first.intensity).toBe(0);
    expect(pool.group.children).toEqual(lights);
    pool.layout(keyBoxes(scene(100, 1.5)));
    expect(pool.group.children).toEqual(lights);
    const parent = new Group();
    parent.add(pool.group);
    pool.dispose();
    expect(parent.children).toHaveLength(0);
    expect(pool.group.children).toHaveLength(0);
  });
});
