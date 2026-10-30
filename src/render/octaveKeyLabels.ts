import type { Locale } from "../i18n/locales";
import { graphicsMessages } from "../i18n/graphicsMessages";
import { translate } from "../i18n/translate";
import { Container, Sprite, Text, type Renderer, type Texture } from "./flatThree";
import { placeKeyboardFingerDigit } from "./keyboardFingerDigits";
import { NO_FINGER_CUES, type LessonFingerCue } from "../reading/fingerCues";
import type { LessonFingerBadges } from "./lessonFingerBadges";
import { LOWEST_PITCH, HIGHEST_PITCH, type KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";

/** A C's actual MIDI octave; no other key gets an octave marker. */
export function keyOctave(pitch: number): number | undefined {
  return Number.isInteger(pitch) && pitch % 12 === 0 ? Math.floor(pitch / 12) - 1 : undefined;
}
export function octaveKeyLabel(pitch: number, locale: Locale): string | undefined {
  const octave = keyOctave(pitch);
  const t = (message: string) =>
    translate(locale, graphicsMessages, message, { octave: octave ?? 0 });
  return octave === undefined ? undefined : t("C{octave}");
}

/** Fixed text is baked before playback and shared by the flat and native keyboard paint. */
export class OctaveKeyLabels {
  readonly container = new Container();
  readonly nativeContainer = new Container({ eventMode: "none" });
  readonly nativeSprites = new Map<number, Sprite>();
  private native = false;
  private readonly lessonPitches = new Set<number>();
  private readonly visiblePitches = new Set<number>();
  private readonly sprites = new Map<number, Sprite>();
  private readonly textures = new Map<string, Texture>();
  private disposed = false;
  private enabled = true;
  private stickers = false;

  constructor(renderer: Renderer) {
    this.container.eventMode = "none";
    this.nativeContainer.visible = false;
    for (const locale of ["ru", "en"] as const) {
      for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
        const label = octaveKeyLabel(pitch, locale);
        if (label === undefined) continue;
        const text = new Text({
          text: label,
          style: {
            fontFamily: "system-ui, sans-serif",
            fontSize: 28,
            fontWeight: "700",
            fill: 0x173e5b,
            stroke: { color: 0xffffff, width: 2 }
          },
          resolution: 3
        });
        const texture = renderer.generateTexture({ target: text, resolution: 3 });
        this.textures.set(`${locale}:${String(pitch)}`, texture);
        text.destroy();
        if (locale !== "ru") continue;
        const sprite = new Sprite(texture);
        sprite.label = `octave:${String(pitch)}`;
        sprite.anchor.set(0.5, 0);
        sprite.eventMode = "none";
        sprite.visible = false;
        this.sprites.set(pitch, sprite);
        this.container.addChild(sprite);
        const overlay = new Sprite(texture);
        overlay.anchor.set(0.5, 1);
        overlay.eventMode = "none";
        overlay.visible = false;
        this.nativeSprites.set(pitch, overlay);
        this.nativeContainer.addChild(overlay);
      }
    }
  }
  setLocale(locale: Locale): void {
    for (const [pitch, sprite] of this.sprites) {
      const texture = this.textures.get(`${locale}:${String(pitch)}`);
      if (texture) {
        sprite.texture = texture;
        const native = this.nativeSprites.get(pitch);
        if (native) native.texture = texture;
      }
    }
  }
  show(enabled = this.enabled, stickers = this.stickers): void {
    this.enabled = enabled;
    this.stickers = stickers;
    this.container.visible = enabled && !stickers && !this.native;
    this.nativeContainer.visible = enabled && !stickers && this.native;
  }
  suppressed(pitch: number): boolean {
    return this.lessonPitches.has(pitch);
  }
  setLessonCues(cues: readonly LessonFingerCue[]): void {
    this.lessonPitches.clear();
    for (const cue of cues)
      if (keyOctave(cue.pitch) !== undefined) this.lessonPitches.add(cue.pitch);
    for (const [pitch, sprite] of this.sprites)
      sprite.visible = this.visiblePitches.has(pitch) && !this.lessonPitches.has(pitch);
  }
  get on(): boolean {
    return this.enabled && !this.stickers;
  }
  setNative(active: boolean): void {
    this.native = active;
    this.show();
  }
  mountNative(stage: Container): void {
    if (this.nativeContainer.parent !== stage) stage.addChild(this.nativeContainer);
  }
  layout(
    keys: ReadonlyMap<number, KeyRect>,
    geometry: Geometry,
    modelFaces: boolean,
    bevel = 3
  ): void {
    const { keyboardTop, keyboardHeight, blackHeight } = geometry;
    this.visiblePitches.clear();
    for (const [pitch, sprite] of this.sprites) {
      const key = keys.get(pitch);
      sprite.visible = key !== undefined && key.width > 0;
      if (!key || key.width <= 0) continue;
      const room = Math.max(0, keyboardHeight - blackHeight - bevel - 8);
      if (room === 0) {
        sprite.visible = false;
        continue;
      }
      const aspect = modelFaces ? (keyboardHeight * 22.5) / key.width / (150 * 0.86) : 1;
      const scale = Math.min(
        (key.width * (modelFaces ? 0.86 : 3.5)) / sprite.texture.width,
        18 / sprite.texture.height,
        room / (sprite.texture.height * aspect)
      );
      sprite.scale.set(scale, scale * aspect);
      sprite.x = key.x + key.width / 2;
      sprite.y = keyboardTop + blackHeight + 2;
      this.visiblePitches.add(pitch);
      sprite.visible = !this.lessonPitches.has(pitch);
    }
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures.values()) texture.destroy(true);
    this.container.destroy({ children: true });
    this.nativeContainer.destroy({ children: true });
  }
}

/** View-owned display preferences also work when set before the keyboard mounts. */
export class KeyboardLabelSettings {
  labels = false;
  octaves = true;
  constructor(
    private readonly targets: () => readonly (
      | {
          showStickers(show: boolean): void;
          showOctaveLabels?(show: boolean): void;
        }
      | undefined
    )[],
    private readonly relayout: () => void
  ) {}
  setLabels = (show: boolean): void => {
    this.labels = show;
    for (const target of this.targets()) target?.showStickers(show);
    this.relayout();
  };
  setOctaves = (show: boolean): void => {
    this.octaves = show;
    for (const target of this.targets()) target?.showOctaveLabels?.(show);
    this.relayout();
  };
}

/** Keep the key layer's frame wiring thin while the existing digit helper owns its fitting. */
export function keyDigit(
  hint: Sprite,
  key: KeyRect,
  geometry: Geometry,
  stickers: boolean,
  modelFaces: boolean,
  bevel: { readonly black: number; readonly white: number },
  labels: OctaveKeyLabels | undefined
): void {
  placeKeyboardFingerDigit(hint, key, geometry, stickers, modelFaces, bevel, labels?.on === true);
}

/** Use exactly the badge owner's authorized cue list, including its existing hints permission. */
export function lessonLabels(
  badges: Pick<LessonFingerBadges, "draw"> | undefined,
  labels: OctaveKeyLabels | undefined,
  frame: { readonly hints?: boolean; readonly fingerCues?: readonly LessonFingerCue[] },
  keys: ReadonlyMap<number, KeyRect>,
  geometry: Geometry,
  modelFaces: boolean
): void {
  const cues = frame.hints === false ? NO_FINGER_CUES : (frame.fingerCues ?? NO_FINGER_CUES);
  labels?.setLessonCues(cues);
  badges?.draw(cues, keys, geometry, modelFaces);
}
