import { Container, type Texture } from "./flatThree";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";
import type { WorldCamera } from "./worldCamera";

/** Shared source geometry and baked keyboard material for the native scene. */
export interface KeysScene {
  readonly faces: readonly {
    readonly key: KeyRect;
    readonly source: { readonly y: number; readonly height: number };
  }[];
  readonly texture: Texture;
  readonly camera: WorldCamera;
  readonly native?: boolean;
  readonly roadCamera?: WorldCamera;
  readonly keyboardCamera?: WorldCamera;
  /** The standard road straightens onto this keyboard: the shown one, a snapshot, or none. */
  readonly fitCamera?: WorldCamera | "keyboard" | undefined;
  readonly pan: number;
  readonly offset: { readonly x: number; readonly y: number };
  readonly version: number;
}

/** Scene metadata only: flat keyboards retain their own drawing and pointer picking. */
export class NativeKeyboardScene {
  readonly container = new Container({ eventMode: "none" });
  private faces: KeysScene["faces"] = [];
  private texture: Texture | undefined;
  private camera: WorldCamera | undefined;
  private keyboardCamera: WorldCamera | undefined;
  private fitCamera: KeysScene["fitCamera"];
  private pan = 0;
  private version = 0;
  private native = true;

  layout(
    keys: ReadonlyMap<number, KeyRect>,
    geometry: Geometry,
    texture: Texture,
    native = true
  ): void {
    this.version++;
    this.texture = texture;
    this.native = native;
    this.faces = [...keys.values()].map((key) => {
      const y = key.black ? 0 : geometry.blackHeight;
      return {
        key,
        source: {
          y,
          height: Math.max(1, key.black ? geometry.blackHeight : geometry.keyboardHeight - y)
        }
      };
    });
  }

  draw(
    camera: WorldCamera,
    pan: number,
    keyboardCamera = camera,
    fitCamera?: KeysScene["fitCamera"]
  ): void {
    if (
      camera.params.width !== this.camera?.params.width ||
      camera.params.prefs.scale !== this.camera.params.prefs.scale ||
      keyboardCamera.params.prefs.scale !== this.keyboardCamera?.params.prefs.scale
    )
      this.version++;
    this.camera = camera;
    this.keyboardCamera = keyboardCamera;
    this.fitCamera = fitCamera;
    this.pan = pan;
  }

  get scene(): KeysScene | undefined {
    const { texture, camera, keyboardCamera, faces, native, pan, version } = this;
    return texture && camera && keyboardCamera
      ? {
          faces,
          texture,
          camera,
          roadCamera: camera,
          keyboardCamera,
          fitCamera: this.fitCamera,
          native,
          pan,
          version,
          offset: this.container.position
        }
      : undefined;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
