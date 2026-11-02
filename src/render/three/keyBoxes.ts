import { BLACK_NOTE_FLOOR } from "../noteDimensions";
import type { KeysScene } from "../NativeKeyboardScene";
import { isBlackKey } from "../../fingering/fingering";
import {
  KEYBOARD_BLACK_BACK,
  KEYBOARD_BLACK_FRONT,
  KEYBOARD_BLACK_WIDTH,
  KEYBOARD_DEPTH,
  KEYBOARD_WHITE_STEP,
  metricC4X,
  metricKeyX
} from "../keyboardMetrics";

/** One key as a box in world units (about a millimetre), the sizes `keySurface` projects. */
export interface KeyBox {
  readonly pitch: number;
  readonly black: boolean;
  readonly metric?: boolean;
  /** The centre across the keyboard, before the scroll. */
  readonly x: number;
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
  /** Distances from the white keys' front edge towards the back. */
  readonly front: number;
  readonly back: number;
  /** The top face's rect in the keys' texture, 0..1, the back edge at `v0`. */
  readonly uv: {
    readonly u0: number;
    readonly u1: number;
    readonly v0: number;
    readonly v1: number;
  };
}

export function keyBoxes(scene: KeysScene): KeyBox[] {
  const { width, height } = scene.texture;
  const metric = scene.camera.params.keyboardDepth !== undefined;
  return scene.faces.map(({ key, source }) => ({
    pitch: key.pitch,
    black: key.black,
    x: scene.camera.sourceX(key.x + key.width / 2),
    ...(metric ? { metric: true } : {}),
    width: metric ? (key.black ? KEYBOARD_BLACK_WIDTH : KEYBOARD_WHITE_STEP) : key.width / 2,
    bottom: key.black ? 22 : 0,
    top: key.black ? (scene.native ? BLACK_NOTE_FLOOR : 36) : 22,
    front: key.black ? (metric ? KEYBOARD_BLACK_FRONT : 57) : 0,
    back: metric ? (key.black ? KEYBOARD_BLACK_BACK : KEYBOARD_DEPTH) : 142,
    uv: {
      u0: key.x / width,
      u1: (key.x + key.width) / width,
      // Three models the entire white top, including its narrow back between the black keys.
      v0: key.black ? source.y / height : 0,
      v1: (source.y + source.height) / height
    }
  }));
}

/** Every physical key exists even when the song's camera shows only part of the piano. */
export function fullMetricKeyBoxes(scene: KeysScene): KeyBox[] {
  const visible = new Map(keyBoxes(scene).map((box) => [box.pitch, box]));
  const c4 = metricC4X(
    scene.faces.map(({ key }) => key),
    scene.camera.sourceX
  );
  return Array.from({ length: 88 }, (_, index) => {
    const pitch = index + 21;
    const black = isBlackKey(pitch);
    const painted = visible.get(pitch);
    return {
      pitch,
      black,
      metric: true,
      x: c4 + metricKeyX(pitch),
      width: black ? KEYBOARD_BLACK_WIDTH : KEYBOARD_WHITE_STEP,
      bottom: black ? 22 : 0,
      top: black ? 34 : 22,
      front: black ? KEYBOARD_BLACK_FRONT : 0,
      back: black ? KEYBOARD_BLACK_BACK : KEYBOARD_DEPTH,
      uv: painted?.uv ?? { u0: 0, u1: 0, v0: 0, v1: 0 }
    };
  });
}
