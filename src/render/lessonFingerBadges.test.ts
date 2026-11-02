// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { LessonFingerCue } from "../reading/fingerCues";
import { Texture, TextureSource, type Sprite } from "./flatThree";
import { LessonFingerBadges } from "./lessonFingerBadges";

const cues: readonly LessonFingerCue[] = [
  { noteId: "left", pitch: 60, hand: "left", recommendedFinger: 5 },
  { noteId: "right", pitch: 60, hand: "right", recommendedFinger: 1 }
];
const key = { pitch: 60, x: 0, width: 40, black: false };
const geometry = {
  keyboardTop: 100,
  keyboardHeight: 180,
  blackHeight: 110,
  whiteWidth: 40,
  hitY: 96,
  feltHeight: 4
};
function harness() {
  const textures = new Map<string, Texture>();
  for (const locale of ["ru", "en"])
    for (const cue of cues) {
      textures.set(
        `${locale}:${cue.hand}:${String(cue.recommendedFinger)}`,
        new Texture({ source: new TextureSource({ width: 50, height: 32 }) })
      );
    }
  return { badges: new LessonFingerBadges(textures), textures };
}

describe("baked lesson key badges", () => {
  it.each([false, true])(
    "keeps both hands on one key in flat/native view=%s and clears stale sprites",
    (native) => {
      const { badges, textures } = harness();
      badges.draw(cues, new Map([[60, key]]), geometry, native);
      const sprites = badges.container.children as Sprite[];
      const [first, second] = sprites;
      if (!first || !second) throw new Error("Missing both hand badge sprites");
      expect(sprites).toHaveLength(2);
      expect(sprites.every((sprite) => sprite.visible)).toBe(true);
      expect(first.y).toBeLessThan(second.y);
      expect(sprites.map((sprite) => sprite.texture)).toEqual([
        textures.get("ru:left:5"),
        textures.get("ru:right:1")
      ]);
      badges.setLocale("en");
      badges.draw(cues, new Map([[60, key]]), geometry, native);
      expect(sprites.map((sprite) => sprite.texture)).toEqual([
        textures.get("en:left:5"),
        textures.get("en:right:1")
      ]);
      badges.draw([], new Map([[60, key]]), geometry, native);
      expect(sprites.every((sprite) => !sprite.visible)).toBe(true);
      const remaining = cues[1];
      if (!remaining) throw new Error("Missing remaining finger cue");
      badges.draw([remaining], new Map([[60, key]]), geometry, native);
      expect(badges.container.children[0]).toBe(first);
      expect(first.visible).toBe(true);
      expect(second.visible).toBe(false);
    }
  );

  it("uses the same fixed textures on computer keys and creates no canvas during repeated draws", () => {
    const { badges } = harness();
    const create = vi.spyOn(document, "createElement");
    const faces = [{ ...key, y: 100, height: 80 }];
    for (let frame = 0; frame < 30; frame++) badges.drawComputer(cues, faces);
    expect(create.mock.calls.some(([tag]) => tag === "canvas")).toBe(false);
    expect(badges.container.children).toHaveLength(2);
    expect(badges.container.children.every((sprite) => sprite.visible)).toBe(true);
    badges.drawComputer([], faces);
    expect(badges.container.children.every((sprite) => !sprite.visible)).toBe(true);
    create.mockRestore();
  });
});
