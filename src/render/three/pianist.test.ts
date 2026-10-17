import { AnimationClip, Group, Mesh, Object3D, VectorKeyframeTrack } from "three";
import { describe, expect, it } from "vitest";
import { Pianist, isHiddenArmPart } from "./pianist";

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
