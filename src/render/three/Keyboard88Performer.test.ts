import { Bone, Group } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Keyboard88PerformerAsset } from "./keyboard88Loader";
import type { HandsSource } from "./liveHands";
import type * as Keyboard88PlanModule from "./keyboard88Plan";

vi.mock("./keyboard88Plan", async (importOriginal) => {
  const original = await importOriginal<typeof Keyboard88PlanModule>();
  return { ...original, createKeyboard88Plan: vi.fn(original.createKeyboard88Plan) };
});
vi.mock("./keyboard88Mirror", () => ({
  Keyboard88Mirror: class {
    compose(right: Float32Array, _left: Float32Array, target: Float32Array) {
      target.set(right);
    }
  }
}));
vi.mock("./keyboard88Visibility", () => ({
  bindKeyboard88Visibility: () => ({ setVisibility: vi.fn(), dispose: vi.fn() })
}));
vi.mock("./keyboard88RoadBody", () => ({
  bindKeyboard88RoadBody: () => ({ setSeparateCameras: vi.fn(), dispose: vi.fn() })
}));

import { createKeyboard88Plan } from "./keyboard88Plan";
import { Keyboard88Performer } from "./Keyboard88Performer";

function fixture(): Keyboard88PerformerAsset {
  const scene = new Group();
  const bone = new Bone();
  bone.name = "Pelvis";
  scene.add(bone);
  return {
    scene,
    atlas: {
      boneNames: [bone.name],
      frames: [
        { id: 308, assignment: [60, 62, 64, 65, 67], pressedMask: 0 },
        { id: 309, assignment: [60, 62, 64, 65, 67], pressedMask: 1 }
      ],
      rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1])
    },
    rig: { boneNames: [bone.name], parents: [-1], rest: [], rootMatrix: [] },
    manifest: {
      version: 1,
      boneNames: [bone.name],
      frameCount: 2,
      files: {
        body: { url: "body.glb", bytes: 1, sha256: "" },
        skin: { url: "skin.webp", bytes: 1, sha256: "" },
        index: { url: "index.json", bytes: 1, sha256: "" },
        rotations: { url: "poses.bin", bytes: 1, sha256: "" }
      },
      masks: { body: [0], rightHand: [1], leftHand: [2], nails: [] }
    },
    dispose: vi.fn()
  };
}

describe("public performer plan scheduling", () => {
  it("plans only at setSong, reuses the index, and samples without rebuilding in pose", () => {
    vi.mocked(createKeyboard88Plan).mockClear();
    const asset = fixture();
    const dispose = vi.spyOn(asset, "dispose");
    const performer = new Keyboard88Performer(asset);
    const notes: HandsSource["notes"] = {
      left: [],
      right: [{ pitch: 60, finger: 1, start: 0.25, duration: 0.5 }]
    };
    performer.pose(undefined);
    expect(createKeyboard88Plan).not.toHaveBeenCalled();
    performer.setSong(notes);
    performer.setSong(notes);
    expect(createKeyboard88Plan).toHaveBeenCalledOnce();
    for (let i = 0; i < 100; i++) performer.pose({ notes, time: i / 100 });
    expect(createKeyboard88Plan).toHaveBeenCalledOnce();
    const firstIndex = vi.mocked(createKeyboard88Plan).mock.calls[0]?.[2];
    performer.setSong({ left: [], right: [] });
    expect(createKeyboard88Plan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createKeyboard88Plan).mock.calls[1]?.[2]).toBe(firstIndex);
    performer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
