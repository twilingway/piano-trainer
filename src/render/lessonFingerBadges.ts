import type { Locale } from "../i18n/locales";
import { lessonFingerLabel } from "../reading/fingerCueLabel";
import type { LessonFingerCue } from "../reading/fingerCues";
import { Container, Sprite, Text, type Renderer, type Texture } from "./flatThree";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";

/** Bake both languages before playback. No text, canvas or solver is created in draw. */
export function bakeLessonFingerBadges(renderer: Renderer): ReadonlyMap<string, Texture> {
  const textures = new Map<string, Texture>();
  for (const locale of ["ru", "en"] as const) {
    for (const hand of ["left", "right"] as const) {
      for (const recommendedFinger of [1, 2, 3, 4, 5] as const) {
        const text = new Text({
          text: lessonFingerLabel({ noteId: "", pitch: 0, hand, recommendedFinger }, locale),
          style: {
            fontFamily: "system-ui, sans-serif",
            fontSize: 30,
            fontWeight: "800",
            fill: 0xffffff,
            stroke: { color: 0x00314f, width: 4 }
          },
          resolution: 2
        });
        textures.set(
          `${locale}:${hand}:${String(recommendedFinger)}`,
          renderer.generateTexture({ target: text, resolution: 3 })
        );
        text.destroy();
      }
    }
  }
  return textures;
}

/** A stable pool keeps duplicate-pitch hands separate and hides every stale badge each draw. */
export class LessonFingerBadges {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private locale: Locale = "ru";
  constructor(private readonly textures: ReadonlyMap<string, Texture>) {
    this.container.eventMode = "none";
  }
  setLocale(locale: Locale): void {
    this.locale = locale;
  }
  destroy(): void {
    for (const texture of this.textures.values()) texture.destroy(true);
  }
  private sprite(index: number, cue: LessonFingerCue): Sprite {
    let sprite = this.sprites[index];
    if (!sprite) {
      sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      sprite.eventMode = "none";
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    }
    const texture = this.textures.get(
      `${this.locale}:${cue.hand}:${String(cue.recommendedFinger)}`
    );
    if (texture) sprite.texture = texture;
    sprite.visible = true;
    sprite.alpha = 1;
    return sprite;
  }
  draw(
    cues: readonly LessonFingerCue[],
    keys: ReadonlyMap<number, KeyRect>,
    geometry: Geometry,
    modelFaces = false
  ): void {
    for (const sprite of this.sprites) sprite.visible = false;
    let index = 0;
    for (const cue of cues) {
      const key = keys.get(cue.pitch);
      if (!key) continue;
      const sprite = this.sprite(index++, cue);
      const height = key.black ? geometry.blackHeight : geometry.keyboardHeight;
      sprite.scale.set(
        Math.min(
          (key.width * 0.85) / sprite.texture.width,
          26 / sprite.texture.height,
          (height * 0.18) / sprite.texture.height
        )
      );
      sprite.x = key.x + key.width / 2;
      const duplicate = cues.some((other) => other.pitch === cue.pitch && other.hand !== cue.hand);
      if (modelFaces) {
        const depth = key.black ? 94.0242 : 150;
        const units = (key.black ? 13.31152 : 22.5) / key.width;
        sprite.scale.y *= (height * units) / (depth * (key.black ? 0.84 : 0.86));
      }
      sprite.y =
        geometry.keyboardTop +
        height -
        8 -
        (duplicate && cue.hand === "left" ? sprite.height + 3 : 0);
    }
  }
  drawComputer(
    cues: readonly LessonFingerCue[],
    faces: readonly {
      readonly pitch?: number;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }[]
  ): void {
    for (const sprite of this.sprites) sprite.visible = false;
    let index = 0;
    for (const face of faces) {
      for (const cue of cues) {
        if (cue.pitch !== face.pitch) continue;
        const sprite = this.sprite(index++, cue);
        sprite.scale.set(
          Math.min(
            (face.width * 0.7) / sprite.texture.width,
            (face.height * 0.22) / sprite.texture.height
          )
        );
        sprite.x = face.x + face.width / 2;
        const duplicate = cues.some(
          (other) => other.pitch === cue.pitch && other.hand !== cue.hand
        );
        sprite.y =
          face.y + face.height - 3 - (duplicate && cue.hand === "left" ? sprite.height + 2 : 0);
      }
    }
  }
}
