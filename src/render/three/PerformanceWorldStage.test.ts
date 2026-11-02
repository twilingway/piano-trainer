import type { PlaneGeometry, ShaderMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import { PerformanceWorldStage } from "./PerformanceWorldStage";
import type { KeyBox } from "./keyBoxes";
const boxes: KeyBox[] = [
  {
    pitch: 60,
    black: false,
    x: 10,
    width: 22,
    bottom: 0,
    top: 22,
    front: 0,
    back: 142,
    uv: { u0: 0, u1: 1, v0: 0, v1: 1 }
  }
];
const source = { id: "hit", pitch: 60, color: 0xff6600, strength: 1, progress: 1, sounding: true };
const owned: PerformanceWorldStage[] = [];
const geometry = new BoxGeometry(1300, 1800, 900),
  material = new MeshBasicMaterial();
afterEach(() => {
  for (const stage of owned) stage.dispose();
  owned.length = 0;
  vi.restoreAllMocks();
});
function fixture() {
  const scene = new Group(),
    subject = new Group();
  subject.add(new Mesh(geometry, material));
  subject.updateMatrixWorld(true);
  const stage = new PerformanceWorldStage(scene);
  owned.push(stage);
  return { scene, subject, stage, camera: new PerspectiveCamera(45, 1.6, 5, 10000) };
}
function batch(
  stage: PerformanceWorldStage,
  index: number
): InstancedMesh<PlaneGeometry, ShaderMaterial> {
  const group = stage.group.children[index];
  const mesh = group?.children[0];
  if (!(mesh instanceof InstancedMesh)) throw new Error("Missing particle batch");
  return mesh as InstancedMesh<PlaneGeometry, ShaderMaterial>;
}
async function loaded() {
  vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation((url) =>
    Promise.resolve(
      new Texture(
        (url.includes("piano-music-glyphs.svg")
          ? { width: 640, height: 128 }
          : { width: 1536, height: 1152 }) as HTMLImageElement
      )
    )
  );
  const result = fixture();
  await Promise.resolve();
  return result;
}
describe("native stage atomic readiness and world effects", () => {
  it("keeps inspection visible at the start and end with world anchors and the actual camera", async () => {
    const { stage, subject, camera } = await loaded();
    stage.setDuration(154.5);
    camera.position.set(0, 500, 1800);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    stage.update(true, 0, subject, boxes, [source], camera, 142, true, undefined, true);
    expect(stage.group.visible).toBe(true);
    expect(stage.group.children[0]?.visible).toBe(true);
    expect(batch(stage, 1).count).toBe(98);
    const flame = batch(stage, 2);
    const centres = flame.geometry.getAttribute("particleCentre");
    const firstPosition = [centres.getX(0), centres.getY(0), centres.getZ(0)];
    expect(firstPosition).toEqual([10, 40, -142]);
    expect(flame.geometry.getAttribute("particleShape").getZ(0)).toBe(60);
    const right: unknown = flame.material.uniforms.cameraRight?.value;
    if (!(right instanceof Vector3)) throw new Error("Missing billboard camera basis");
    const firstRight = right.clone();
    camera.position.set(1800, 500, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    stage.update(true, 154.5, subject, boxes, [source], camera, 142, true, undefined, true);
    expect(stage.lightFade).toBe(1);
    expect(stage.blackout).toBe(0);
    expect(flame.count).toBe(1);
    expect(batch(stage, 5).count).toBe(1);
    expect([centres.getX(0), centres.getY(0), centres.getZ(0)]).toEqual(firstPosition);
    expect(right.equals(firstRight)).toBe(false);
    // Inspection never substitutes a presentation clock for the session's atlas time.
    expect(flame.geometry.getAttribute("particleShape").getZ(0)).toBe(24);
    stage.update(true, 154.5, subject, boxes, [source], camera, 142);
    expect(stage.lightFade).toBe(0);
    expect(stage.blackout).toBe(1);
  });

  it("lights the octave rim for every visible future finger color before any keyboard contact", async () => {
    const { stage, subject, camera } = await loaded();
    const visible = {
      noteCount: 3,
      notes: [
        { x: 0, top: 5000, bottom: 4800, width: 20, color: 0xff2299, alpha: 1, pitch: 60 },
        { x: 0, top: 4500, bottom: 4300, width: 20, color: 0x22dd99, alpha: 1, pitch: 72 },
        { x: 0, top: 4000, bottom: 3800, width: 20, color: 0xff2299, alpha: 0.5, pitch: 60 }
      ]
    };
    stage.update(true, 20, subject, boxes, [], camera, 142, true, visible);
    const fire = batch(stage, 5);
    expect(fire.count).toBe(10);
    const centers = fire.geometry.getAttribute("particleCentre");
    expect(centers.getZ(0)).not.toBeCloseTo(-142);
    expect(centers.getX(1)).not.toBeCloseTo(centers.getX(0));
    const colors = fire.geometry.getAttribute("particleTint");
    expect(colors.getX(2)).toBeCloseTo(1);
    expect(colors.getY(2)).toBeCloseTo(0x22 / 255);
    expect(colors.getY(7)).toBeCloseTo(0xdd / 255);
    expect(batch(stage, 4).count).toBe(0);
    stage.update(true, 20, subject, boxes, [], camera, 142, true, { notes: [], noteCount: 0 });
    expect(fire.count).toBe(0);
    expect(
      stage.group.children.filter((c) => c instanceof PointLight && c.intensity > 0)
    ).toHaveLength(0);
  });

  it("keeps native effects empty while any atlas is unavailable", () => {
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation(
      () => new Promise<Texture<HTMLImageElement>>(() => undefined)
    );
    const { stage, subject, camera } = fixture();
    stage.update(true, 20, subject, boxes, [source], camera, 142);
    expect(stage.ready).toBe(false);
    for (const index of [1, 2, 3, 4]) expect(batch(stage, index).count).toBe(0);
  });
  it("draws keyboard plus octave-rim fire/hits and dense spatial mist only after every atlas is ready", async () => {
    const { stage, subject, camera } = await loaded();
    stage.update(true, 20, subject, boxes, [source], camera, 142);
    expect(stage.ready).toBe(true);
    expect(batch(stage, 1).count).toBe(98);
    expect(batch(stage, 2).count).toBe(1);
    expect(batch(stage, 5).count).toBe(1);
    expect(batch(stage, 3).count).toBe(2);
    expect(batch(stage, 4).count).toBe(2);
    const lights = stage.group.children.filter(
      (child): child is PointLight => child instanceof PointLight
    );
    expect(lights.filter((light) => light.intensity > 0)).toHaveLength(1);
    expect(lights[0]?.color.getHex()).toBe(source.color);
    const centres = batch(stage, 2).geometry.getAttribute("particleCentre");
    expect(centres.getX(0)).toBeCloseTo(10);
    expect(centres.getZ(0)).toBeCloseTo(-142);
    expect(
      Math.abs(batch(stage, 5).geometry.getAttribute("particleCentre").getZ(0) + 142)
    ).toBeGreaterThan(400);
  });
  it("keeps only keyboard mist before the light cue and clears on mode exit", async () => {
    const { stage, subject, camera } = await loaded();
    stage.update(true, 0, subject, boxes, [], camera, 142);
    expect(batch(stage, 1).count).toBe(2);
    expect(batch(stage, 2).count).toBe(0);
    stage.update(true, 20, subject, boxes, [source], camera, 142);
    stage.update(true, 20, subject, boxes, [source], camera, 142);
    expect(batch(stage, 4).count).toBe(2);
    stage.update(false, 20, subject, boxes, [], camera, 142);
    expect(stage.group.visible).toBe(false);
    expect(
      stage.group.children
        .filter((child): child is PointLight => child instanceof PointLight)
        .every((light) => light.intensity === 0)
    ).toBe(true);
    stage.update(true, 10, subject, boxes, [], camera, 142);
    expect(batch(stage, 4).count).toBe(0);
  });
  it("does not replace legacy if one atlas fails and releases its scene ownership", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockRejectedValue(new Error("missing"));
    const { stage, subject, camera, scene } = fixture();
    await Promise.resolve();
    await Promise.resolve();
    stage.update(true, 20, subject, boxes, [source], camera, 142);
    expect(stage.ready).toBe(false);
    stage.dispose();
    expect(scene.children).not.toContain(stage.group);
  });
  it("can prepare its layout without emitting one frame of duplicate native/legacy fire", async () => {
    const { stage, subject, camera } = await loaded();
    stage.update(true, 20, subject, boxes, [source], camera, 142, false);
    expect(stage.ready).toBe(true);
    expect(stage.group.visible).toBe(true);
    for (const index of [1, 2, 3, 4]) expect(batch(stage, index).count).toBe(0);
    stage.update(true, 20, subject, boxes, [source], camera, 142, true);
    expect(batch(stage, 2).count).toBe(1);
    expect(batch(stage, 5).count).toBe(1);
  });
  it("fades native light/fire/mist and covers the entire scene at the real song end", async () => {
    const { stage, subject, camera } = await loaded();
    stage.setDuration(154.5);
    stage.update(true, 154.5, subject, boxes, [source], camera, 142);
    expect(stage.lightFade).toBe(0);
    expect(stage.blackout).toBe(1);
    for (const index of [1, 2, 3, 4]) expect(batch(stage, index).count).toBe(0);
    expect(
      stage.group.children
        .filter((c): c is PointLight => c instanceof PointLight)
        .every((l) => l.intensity === 0)
    ).toBe(true);
    stage.update(true, 152.5, subject, boxes, [source], camera, 142);
    expect(stage.blackout).toBe(0.5);
    const fade = stage.lightFade;
    stage.update(true, 152.5, subject, boxes, [source], camera, 142);
    expect(stage.lightFade).toBe(fade);
    expect(stage.blackout).toBe(0.5);
    stage.update(true, 20, subject, boxes, [source], camera, 142);
    expect(stage.blackout).toBe(0);
    expect(stage.lightFade).toBe(1);
    expect(batch(stage, 2).count).toBe(1);
    expect(batch(stage, 5).count).toBe(1);
  });
});

describe("bass fire on the stage", () => {
  const empty = { notes: [], noteCount: 0 };
  const lit = (stage: PerformanceWorldStage) =>
    stage.group.children.filter((child) => child instanceof PointLight && child.intensity > 0);
  it("bursts around the platform at bass onsets only and dies out between them", async () => {
    const { stage, subject, camera } = await loaded();
    stage.setBassNotes({ left: [{ start: 21, pitch: 41 }] });
    stage.update(true, 20.9, subject, boxes, [], camera, 142, true, empty);
    expect(batch(stage, 5).count).toBe(0);
    expect(lit(stage)).toHaveLength(0);
    stage.update(true, 21, subject, boxes, [], camera, 142, true, empty);
    expect(batch(stage, 5).count).toBe(12);
    expect(batch(stage, 2).count).toBe(12);
    expect(lit(stage).length).toBeGreaterThan(0);
    stage.update(true, 21.8, subject, boxes, [], camera, 142, true, empty);
    expect(batch(stage, 5).count).toBe(0);
    expect(lit(stage)).toHaveLength(0);
  });
  it("never bursts without the song's bass notes", async () => {
    const { stage, subject, camera } = await loaded();
    stage.update(true, 21, subject, boxes, [], camera, 142, true, empty);
    expect(batch(stage, 5).count).toBe(0);
    stage.setBassNotes({ left: [{ start: 21, pitch: 41 }] });
    stage.setBassNotes(undefined);
    stage.update(true, 21, subject, boxes, [], camera, 142, true, empty);
    expect(batch(stage, 5).count).toBe(0);
    expect(lit(stage)).toHaveLength(0);
  });
});

it.each(
  Array.from({ length: 8 }, (_, mask) => ({
    burning: (mask & 1) !== 0,
    presses: (mask & 2) !== 0,
    musicalNotes: (mask & 4) !== 0
  }))
)("honors independent world animations for %j", async (options) => {
  const { stage, subject, camera } = await loaded();
  stage.update(true, 20, subject, boxes, [source], camera, 142, true, undefined, true, options);
  stage.update(true, 20.1, subject, boxes, [source], camera, 142, true, undefined, true, options);
  expect(batch(stage, 1).count > 0).toBe(options.burning);
  expect(batch(stage, 2).count > 0).toBe(options.burning);
  expect(batch(stage, 4).count > 0).toBe(options.presses);
  const spirals = stage.group.children[6];
  expect(spirals?.visible).toBe(options.musicalNotes);
});

it("anchors world flames and flashes without loading or showing keyboard meshes", async () => {
  const { stage, camera } = await loaded();
  const hidden = new Group();
  hidden.visible = false;
  hidden.position.set(100, 50, 10);
  hidden.scale.setScalar(2);
  stage.update(true, 20, hidden, boxes, [source], camera, 142, true, undefined, true);
  expect(stage.stage).toBeDefined();
  expect(batch(stage, 2).count).toBe(1);
  expect(batch(stage, 4).count).toBeGreaterThan(0);
  const centres = batch(stage, 2).geometry.getAttribute("particleCentre");
  expect([centres.getX(0), centres.getY(0), centres.getZ(0)]).toEqual([120, 130, -274]);
  expect(hidden.visible).toBe(false);
  expect(hidden.children).toHaveLength(0);
});

it("places metric back-row effects on the same GLB stem anchor as notes", () => {
  const { stage, subject } = fixture();
  subject.scale.setScalar(2);
  subject.position.set(20, 30, 40);
  subject.updateMatrixWorld(true);
  const box = boxes[0];
  if (!box) throw new Error("Missing test key");
  for (const black of [false, true]) {
    const pitch = black ? 61 : 60;
    stage.prepare(subject, [{ ...box, pitch, black, top: black ? 34 : 22, metric: true }], 150);
    const key = (
      stage as unknown as { keys: Map<number, { x: number; y: number; z: number }> }
    ).keys.get(pitch);
    expect(key?.x).toBeCloseTo(20 + (10 - (black ? 0 : 3.575)) * 2);
    expect(key?.y).toBeCloseTo(30 + (black ? 34 : 22) * 2);
    expect(key?.z).toBeCloseTo(40 - (black ? 145.8 : 149.1938) * 2);
  }
});
