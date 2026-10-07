import type { KeysScene } from "../PerspectiveKeyboardLayer";

/** One key as a box in world units (about a millimetre), the sizes `keySurface` projects. */
export interface KeyBox {
  readonly pitch: number;
  readonly black: boolean;
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
  return scene.faces.map(({ key, source }) => ({
    pitch: key.pitch,
    black: key.black,
    x: scene.camera.sourceX(key.x + key.width / 2),
    width: key.width / 2,
    bottom: key.black ? 22 : 0,
    top: key.black ? 36 : 22,
    front: key.black ? 57 : 0,
    back: 142,
    uv: {
      u0: key.x / width,
      u1: (key.x + key.width) / width,
      v0: source.y / height,
      v1: (source.y + source.height) / height
    }
  }));
}
