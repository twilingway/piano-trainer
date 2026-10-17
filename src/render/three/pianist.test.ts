import { AnimationClip, Camera, Group, Mesh, Object3D, VectorKeyframeTrack } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pianist, isHiddenArmPart, loadPianist } from "./pianist";

describe("isHiddenArmPart", () => {
  it("hides the forearm cuts, the gloves and the cuffs", () => {
    for (const name of [
      "Aristocratic_Coat_ArmCut_L",
      "PianistBody_ArmCut_R",
      "White_Closed_Glove_L",
      "White_Closed_Glove_R",
      "White_Cuff_L",
      "White_Cuff_R"
    ])
      expect(isHiddenArmPart(name)).toBe(true);
  });

  it("keeps the rest of the character", () => {
    for (const name of [
      "Aristocratic_Coat",
      "PianistBody",
      "PersonalHead_UV",
      "Black_Glasses_Frame_1",
      "Ready_Oxford_Shoe_L",
      "hand.R"
    ])
      expect(isHiddenArmPart(name)).toBe(false);
  });
});

describe("Pianist", () => {
  it("sits still in the clip's first frame", () => {
    const scene = new Group();
    const node = new Object3D();
    node.name = "walker";
    scene.add(node, new Mesh());
    const track = new VectorKeyframeTrack("walker.position", [0, 8], [2, 0, 0, 8, 0, 0]);
    new Pianist({ scene, clip: new AnimationClip("IndexFingerTest_8s", 8, [track]) });
    expect(node.position.x).toBeCloseTo(2, 5);
  });

  it("sits on C4 at the white keys' front top edge, a white key to a white key", () => {
    const pianist = new Pianist({ scene: new Group(), clip: undefined });
    // E4 is two white keys right of C4.
    pianist.layout({ pitch: 64, x: 194, width: 47 });
    expect(pianist.space.position.x).toBeCloseTo(100);
    expect(pianist.space.position.y).toBe(22);
    expect(pianist.space.position.z).toBe(0);
    // The lab's white key is 23.5 mm.
    expect(pianist.space.scale.x).toBeCloseTo(47 / 0.0235);
  });
});

const source = {
  id: "synthetic",
  midiSha256: "a".repeat(64),
  sourceSha256: "b".repeat(64),
  noteCount: 1,
  timeOriginSeconds: 0
};
function nativeModel() {
  const scene = new Group(),
    bone = new Object3D();
  bone.name = "originalWrist";
  scene.add(bone);
  return {
    bone,
    scene,
    clip: new AnimationClip("SourcePerformance", 10, [
      new VectorKeyframeTrack("originalWrist.position", [0, 5, 10], [0, 0, 0, 2, 0, 0, 1, 0, 0])
    ]),
    performance: {
      sourcePerformanceId: source.id,
      midiSha256: source.midiSha256,
      sourceSha256: source.sourceSha256,
      durationSeconds: 10,
      timeOriginSeconds: 0
    }
  };
}
afterEach(() => vi.restoreAllMocks());

describe("native original-skeleton pianist", () => {
  it("samples session time deterministically without a replacement rig or an extra bench", async () => {
    const { PianistRig } = await import("./pianistRig");
    const createRig = vi.spyOn(PianistRig, "create");
    const model = nativeModel(),
      pianist = new Pianist(model, source),
      camera = new Camera();
    const hands = (time: number) => ({ time, performance: source, notes: { left: [], right: [] } });
    expect(pianist.native).toBe(true);
    expect(pianist.rig).toBeUndefined();
    expect(pianist.bench).toBeUndefined();
    expect(createRig).not.toHaveBeenCalled();
    for (const [time, x] of [
      [5, 2],
      [5, 2],
      [1, 0.4],
      [10, 1],
      [0, 0]
    ]) {
      pianist.sample(hands(time ?? 0), camera);
      expect(model.bone.position.x).toBeCloseTo(x ?? 0);
    }
    pianist.sample({ ...hands(5), performance: { ...source, id: "other" } }, camera);
    expect(pianist.space.visible).toBe(false);
    pianist.sample(hands(5), camera);
    expect(pianist.space.visible).toBe(true);
    pianist.dispose();
    pianist.dispose();
    const disposedX = model.bone.position.x;
    pianist.sample(hands(0), camera);
    expect(model.bone.position.x).toBe(disposedX);
  });
  it("orders gaze restore, native sample, face and additive gaze using the current camera", async () => {
    const { NativePianistClip } = await import("./nativePianistClip");
    const { CameraPerformerGaze } = await import("./CameraPerformerGaze");
    const { PianistFace } = await import("./PianistFace");
    const { NativePerformerMotion } = await import("./NativePerformerMotion");
    const order: string[] = [];
    vi.spyOn(NativePerformerMotion.prototype, "prepare").mockImplementation(() => {
      order.push("motion-prepare");
    });
    vi.spyOn(NativePerformerMotion.prototype, "apply").mockImplementation(() => {
      order.push("motion");
    });
    vi.spyOn(CameraPerformerGaze.prototype, "prepare").mockImplementation(() => {
      order.push("prepare");
    });
    const apply = vi.spyOn(CameraPerformerGaze.prototype, "apply").mockImplementation(() => {
      order.push("gaze");
      return { headYaw: 0, headPitch: 0, eyeYaw: 0, eyePitch: 0, weight: 0 };
    });
    vi.spyOn(PianistFace, "create").mockReturnValue({
      update: () => {
        order.push("face");
      },
      dispose: () => undefined
    } as unknown as NonNullable<ReturnType<typeof PianistFace.create>>);
    const sample = vi.spyOn(NativePianistClip.prototype, "sample");
    const pianist = new Pianist(nativeModel(), source),
      camera = new Camera();
    camera.position.set(3, 4, 5);
    const original = sample.getMockImplementation();
    sample.mockImplementation(function (this: InstanceType<typeof NativePianistClip>, ...args) {
      order.push("sample");
      return original?.apply(this, args) ?? true;
    });
    order.length = 0;
    pianist.sample({ time: 7, performance: source, notes: { left: [], right: [] } }, camera);
    expect(order).toEqual(["prepare", "motion-prepare", "sample", "motion", "face", "gaze"]);
    expect(apply.mock.calls.at(-1)?.[0]).toMatchObject({ x: 3, y: 4, z: 5 });
    expect(apply.mock.calls.at(-1)?.[1]).toBe(7);
    pianist.dispose();
  });
  it("tries native first, preserves native arms, and falls back if no native binding is available", async () => {
    const native = await import("./nativePianistModel"),
      local = await import("./pianistModel");
    const loadNative = vi.spyOn(native, "loadNativePianist");
    const localUrl = vi.spyOn(local, "pianistModelUrl").mockResolvedValue(undefined);
    const model = nativeModel(),
      arm = new Group();
    arm.name = "White_Closed_Glove_L";
    model.scene.add(arm);
    loadNative.mockResolvedValueOnce(model);
    expect(await loadPianist(source)).toBe(model);
    expect(arm.visible).toBe(true);
    expect(localUrl).not.toHaveBeenCalled();
    loadNative.mockResolvedValueOnce(undefined);
    expect(await loadPianist(source)).toBeUndefined();
    expect(localUrl).toHaveBeenCalledOnce();
    loadNative.mockRejectedValueOnce(Error("bad local asset"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await loadPianist(source)).toBeUndefined();
    expect(localUrl).toHaveBeenCalledTimes(2);
  });
});

describe("fallback camera attention", () => {
  it("restores gaze before the existing rig pose, applies current-camera gaze after it and does not repeat face update", async () => {
    const { PianistRig } = await import("./pianistRig");
    const { CameraPerformerGaze } = await import("./CameraPerformerGaze");
    const { PianistFace } = await import("./PianistFace");
    const order: string[] = [];
    const update = vi.fn();
    vi.spyOn(PianistFace, "create").mockReturnValue({
      update,
      dispose: () => undefined
    } as unknown as NonNullable<ReturnType<typeof PianistFace.create>>);
    const pose = vi.fn(() => {
      order.push("rig");
      update();
    });
    vi.spyOn(PianistRig, "create").mockReturnValue({
      seat: () => undefined,
      setFace: () => undefined,
      pose
    } as unknown as NonNullable<ReturnType<typeof PianistRig.create>>);
    vi.spyOn(CameraPerformerGaze.prototype, "prepare").mockImplementation(() => {
      order.push("prepare");
    });
    const gaze = vi.spyOn(CameraPerformerGaze.prototype, "apply").mockImplementation(() => {
      order.push("gaze");
      return { headYaw: 0, headPitch: 0, eyeYaw: 0, eyePitch: 0, weight: 0 };
    });
    const pianist = new Pianist({ scene: new Group(), clip: undefined }),
      camera = new Camera();
    camera.position.set(1, 2, 3);
    const poses = { left: undefined, right: undefined },
      hands = { time: 24, notes: { left: [], right: [] } };
    order.length = 0;
    update.mockClear();
    pianist.poseFallback(poses, hands, camera);
    expect(order).toEqual(["prepare", "rig", "gaze"]);
    expect(pose).toHaveBeenLastCalledWith(poses, hands);
    expect(update).toHaveBeenCalledOnce();
    expect(gaze).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 2, z: 3 }), 24);
    pianist.dispose();
    order.length = 0;
    pianist.poseFallback(poses, hands, camera);
    expect(order).toEqual([]);
  });
});
