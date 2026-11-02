import {
  Group,
  PerspectiveCamera,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  Vector3
} from "three";
import type { Camera, Texture } from "three";
import type { FreeRoadLane } from "../freeRoadLayout";
import { arrivalFrame } from "../noteArrival";
import type { ThreeRoadFrame } from "./ThreeRoadFrame";

/** The same White Explosion atlas as the flat road's horizon bursts. */
const ATLAS = new URL("../../fx/horizon-explosion.webp", import.meta.url).href;
const COLS = 5;
const ROWS = 3;
const FRAMES = 15;
const MAX_BURSTS = 32;
/**
 * However far the field's end is, a burst's cell stays at least this share of the screen's height:
 * the flash fills a fifth of its cell, the ring about a half.
 */
export const FREE_BURST_MIN_SHARE = 0.15;
/** Up close a burst's cell covers this many lane steps of the field's far end. */
const LANE_STEPS = 5;

/** Lane spacing at the field's far end, in the road group's units. */
export function freeLaneStep(lanes: readonly FreeRoadLane[]): number {
  const first = lanes[0],
    last = lanes[lanes.length - 1];
  if (!first || !last || lanes.length < 2) return first?.width ?? 0;
  const span = Math.hypot(last.far.x - first.far.x, last.far.y - first.far.y);
  return span / (lanes.length - 1);
}

/** World size of a burst: its lanes up close, a fixed share of the screen from afar. */
export function freeBurstSize(step: number, distance: number, fovDegrees: number): number {
  const screen = 2 * Math.max(0, distance) * Math.tan((fovDegrees * Math.PI) / 360);
  return Math.max(step * LANE_STEPS, screen * FREE_BURST_MIN_SHARE);
}

/** Notes born at the free field's far end: world sprites in the road group, facing the camera. */
export class ThreeFreeBursts {
  readonly group = new Group();
  private frames: Texture[] = [];
  private readonly sprites: Sprite[] = [];
  private readonly world = new Vector3();
  private readonly eye = new Vector3();
  private readonly scale = new Vector3();
  private disposed = false;

  async load(): Promise<void> {
    try {
      const atlas = await new TextureLoader().loadAsync(ATLAS);
      if (this.disposed) atlas.dispose();
      else this.setAtlas(atlas);
    } catch (error) {
      console.warn("The free field explosion did not load; notes appear without it", error);
    }
  }

  setAtlas(atlas: Texture): void {
    atlas.colorSpace = SRGBColorSpace;
    this.frames = Array.from({ length: FRAMES }, (_, index) => {
      const frame = atlas.clone();
      frame.repeat.set(1 / COLS, 1 / ROWS);
      frame.offset.set((index % COLS) / COLS, 1 - (Math.floor(index / COLS) + 1) / ROWS);
      return frame;
    });
  }

  update(frame: ThreeRoadFrame | undefined, camera: Camera): void {
    let used = 0;
    if (frame && this.frames.length > 0) {
      this.group.updateWorldMatrix(true, false);
      const unit = Math.max(0.000001, this.scale.setFromMatrixScale(this.group.matrixWorld).x);
      camera.updateMatrixWorld();
      this.eye.setFromMatrixPosition(camera.matrixWorld);
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 45;
      const step = freeLaneStep(frame.freeLanes) * unit;
      for (let index = 0; index < frame.burstCount && used < MAX_BURSTS; index++) {
        const burst = frame.bursts[index];
        const phase = burst && arrivalFrame(burst.age, this.frames.length);
        const texture = phase === undefined ? undefined : this.frames[phase];
        if (!burst || !texture) continue;
        const sprite = this.sprite(used++);
        sprite.position.set(burst.x, burst.y, burst.z);
        this.world.copy(sprite.position).applyMatrix4(this.group.matrixWorld);
        const size = freeBurstSize(step, this.world.distanceTo(this.eye), fov) / unit;
        sprite.scale.set(size, size, 1);
        sprite.material.map = texture;
        sprite.material.color.setHex(burst.color);
        sprite.visible = true;
      }
    }
    for (let index = used; index < this.sprites.length; index++) {
      const sprite = this.sprites[index];
      if (sprite) sprite.visible = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const sprite of this.sprites) sprite.material.dispose();
    for (const frame of this.frames) frame.dispose();
    this.group.clear();
  }

  private sprite(index: number): Sprite {
    const existing = this.sprites[index];
    if (existing) return existing;
    // The world score stands at the field's far end: the birth flashes over it, like a light.
    const sprite = new Sprite(
      new SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      })
    );
    sprite.renderOrder = 10;
    this.sprites.push(sprite);
    this.group.add(sprite);
    return sprite;
  }
}
