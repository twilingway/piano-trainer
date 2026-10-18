import { AnimationClip, Group, NumberKeyframeTrack, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { NativePianistClip, readNativePerformance } from "./nativePianistClip";

const source = {
  id: "synthetic",
  midiSha256: "a".repeat(64),
  sourceSha256: "b".repeat(64),
  noteCount: 1,
  timeOriginSeconds: 0,
  durationSeconds: 10
};
const binding = {
  sourcePerformanceId: source.id,
  midiSha256: source.midiSha256,
  sourceSha256: source.sourceSha256,
  durationSeconds: 10,
  timeOriginSeconds: 0
};
function fixture() {
  const scene = new Group(),
    hand = new Object3D();
  hand.name = "originalWrist";
  scene.add(hand);
  scene.userData = { ...binding, sourceEndSeconds: 10, complete: true };
  const clip = new AnimationClip("SourcePerformance", 10, [
    new NumberKeyframeTrack("originalWrist.position[x]", [0, 5, 10], [0, 2, 1])
  ]);
  return { scene, hand, clip };
}
describe("native source performance", () => {
  it("requires the exact input and a complete clip with the original time origin", () => {
    const { scene, clip } = fixture();
    expect(readNativePerformance(scene, clip, source)).toEqual(binding);
    expect(
      readNativePerformance(scene, clip, { ...source, midiSha256: "c".repeat(64) })
    ).toBeUndefined();
    scene.userData.complete = false;
    expect(readNativePerformance(scene, clip, source)).toBeUndefined();
    scene.userData.complete = true;
    scene.userData.sourceEndSeconds = 8;
    expect(readNativePerformance(scene, clip, source)).toBeUndefined();
    scene.userData.sourceEndSeconds = 10;
    scene.userData.timeOriginSeconds = 2.7;
    expect(readNativePerformance(scene, clip, source)).toBeUndefined();
  });
  it("samples original curves deterministically across pause, end and backward seeks", () => {
    const { scene, hand, clip } = fixture();
    const player = new NativePianistClip(scene, clip, binding);
    expect(player.sample(5, source)).toBe(true);
    expect(hand.position.x).toBe(2);
    player.sample(10, source);
    expect(hand.position.x).toBe(1);
    player.sample(5, source);
    expect(hand.position.x).toBe(2);
    player.sample(5, source);
    expect(hand.position.x).toBe(2);
    expect(player.sample(7, { ...source, sourceSha256: "d".repeat(64) })).toBe(false);
    expect(hand.position.x).toBe(2);
    player.dispose();
  });
});

it("rejects self-consistent short complete clips against the actual song duration", () => {
  const { scene, clip } = fixture();
  scene.userData.durationSeconds = 8;
  scene.userData.sourceEndSeconds = 8;
  clip.duration = 8;
  expect(readNativePerformance(scene, clip, { ...source, durationSeconds: 154.5 })).toBeUndefined();
  const { durationSeconds: _duration, ...withoutDuration } = source;
  expect(readNativePerformance(scene, clip, withoutDuration)).toBeUndefined();
  for (const durationSeconds of [0, -1, NaN, Infinity]) {
    expect(readNativePerformance(scene, clip, { ...source, durationSeconds })).toBeUndefined();
  }
  expect(readNativePerformance(scene, clip, { ...source, durationSeconds: 8 })).toBeDefined();
  scene.userData.durationSeconds = 154.5;
  scene.userData.sourceEndSeconds = 154.5;
  expect(readNativePerformance(scene, clip, { ...source, durationSeconds: 154.5 })).toBeUndefined();
  clip.duration = 154.5;
  expect(readNativePerformance(scene, clip, { ...source, durationSeconds: 154.5 })).toBeDefined();
  scene.userData.durationSeconds = 160;
  expect(readNativePerformance(scene, clip, { ...source, durationSeconds: 154.5 })).toBeUndefined();
  scene.userData.durationSeconds = 154.5;
  scene.userData.sourceEndSeconds = NaN;
  expect(readNativePerformance(scene, clip, { ...source, durationSeconds: 154.5 })).toBeUndefined();
});
