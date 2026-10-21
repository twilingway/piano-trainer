import {
  AnimationClip,
  Bone,
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  Group,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  VectorKeyframeTrack
} from "three";
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
  it("uses the same uniform metric scale as keyboard88 without changing the DEV loader", () => {
    const pianist = new Pianist({ scene: new Group(), clip: undefined });
    pianist.layout({ pitch: 64, x: 47, width: 23.5, metric: true });
    expect(pianist.space.scale.toArray()).toEqual([1000, 1000, 1000]);
    expect(pianist.space.position.toArray()).toEqual([0, 22, 0]);
    pianist.dispose();
  });
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
  it("keeps runtime face overlays hidden while sampling hands without the body", async () => {
    const { PianistFace } = await import("./PianistFace");
    const model = nativeModel(),
      blink = new Mesh();
    blink.name = "PianistBlink_1";
    blink.visible = false;
    vi.spyOn(PianistFace, "create").mockImplementation(() => {
      model.scene.add(blink);
      return {
        update: () => {
          blink.visible = true;
        },
        dispose: () => undefined
      } as unknown as NonNullable<ReturnType<typeof PianistFace.create>>;
    });
    const pianist = new Pianist(model, source),
      hands = { time: 5, performance: source, notes: { left: [], right: [] } };
    pianist.setBodyVisible(false);
    pianist.sample(hands, new Camera());
    expect(blink.visible).toBe(false);
    expect(model.bone.position.x).toBeCloseTo(2);
    pianist.setBodyVisible(true);
    pianist.sample(hands, new Camera());
    expect(blink.visible).toBe(true);
    pianist.dispose();
  });

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
    const marker = new Group(),
      nail = new Group(),
      anatomicalNails = new Group();
    marker.name = "ridge-finger3-2L";
    nail.name = "nail-finger3-3L";
    anatomicalNails.name = "HandNails";
    model.scene.add(arm, marker, nail, anatomicalNails);
    loadNative.mockResolvedValueOnce(model);
    expect(await loadPianist(source)).toBe(model);
    expect(arm.visible).toBe(true);
    expect(marker.visible).toBe(false);
    expect(nail.visible).toBe(false);
    expect(anatomicalNails.visible).toBe(true);
    expect(localUrl).not.toHaveBeenCalled();
    loadNative.mockResolvedValueOnce(undefined);
    expect(await loadPianist(source)).toBeUndefined();
    expect(localUrl).toHaveBeenCalledOnce();
    loadNative.mockRejectedValueOnce(Error("bad local asset"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await loadPianist(source)).toBeUndefined();
    expect(localUrl).toHaveBeenCalledTimes(2);
    loadNative.mockResolvedValueOnce(undefined);
    expect(await loadPianist(source, true)).toBeUndefined();
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

it("hides only the lower body overhead and restores the original skin for other views", () => {
  const model = nativeModel(),
    leg = new Bone(),
    wrist = new Bone();
  leg.name = "lowerleg01.L";
  wrist.name = "wrist.L";
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(new Array<number>(18).fill(0), 3));
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      4
    )
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      4
    )
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  const body = new SkinnedMesh(geometry);
  body.name = "PianistBody";
  body.add(leg, wrist);
  body.bind(new Skeleton([leg, wrist]));
  const shoe = new Mesh(),
    trousers = new Mesh(),
    hiddenShoe = new Mesh(),
    hand = new Mesh();
  shoe.name = "Ready_Oxford_Shoe_L";
  hiddenShoe.name = "Ready_Oxford_Shoe_R";
  hiddenShoe.visible = false;
  trousers.name = "Tailored_Trousers";
  hand.name = "nail-finger1-3.L";
  model.scene.add(body, shoe, hiddenShoe, trousers, hand);
  const pianist = new Pianist(model, source);
  const bonesBefore = body.skeleton.bones.map((bone) => bone.matrixWorld.toArray());
  pianist.setTopView(true);
  const overhead = body.geometry;
  expect(Array.from(overhead.index?.array ?? [])).toEqual([3, 4, 5]);
  expect(Array.from(geometry.index?.array ?? [])).toEqual([0, 1, 2, 3, 4, 5]);
  expect(overhead.groups.at(-1)).toEqual({ start: 0, count: 3, materialIndex: 1 });
  expect(shoe.visible).toBe(false);
  expect(trousers.visible).toBe(false);
  expect(hand.visible).toBe(true);
  expect(body.skeleton.bones.map((bone) => bone.matrixWorld.toArray())).toEqual(bonesBefore);
  pianist.setTopView(false);
  expect(body.geometry).toBe(geometry);
  expect(shoe.visible).toBe(true);
  expect(trousers.visible).toBe(true);
  expect(hiddenShoe.visible).toBe(false);
  pianist.setTopView(true);
  expect(body.geometry).toBe(overhead);
  const dispose = vi.spyOn(overhead, "dispose");
  pianist.setBodyVisible(false);
  const handsOnly = body.geometry;
  expect(handsOnly).not.toBe(overhead);
  expect(Array.from(handsOnly.index?.array ?? [])).toEqual([3, 4, 5]);
  expect(shoe.visible).toBe(false);
  expect(trousers.visible).toBe(false);
  pianist.setTopView(false);
  expect(body.geometry).toBe(handsOnly);
  pianist.setBodyVisible(true);
  expect(body.geometry).toBe(geometry);
  expect(shoe.visible).toBe(true);
  pianist.setTopView(true);
  expect(body.geometry).toBe(overhead);
  const disposeHands = vi.spyOn(handsOnly, "dispose");
  pianist.dispose();
  expect(body.geometry).toBe(geometry);
  expect(dispose).toHaveBeenCalledOnce();
  expect(disposeHands).toHaveBeenCalledOnce();
});
