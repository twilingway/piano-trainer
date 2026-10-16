import { Group, RectAreaLight, Vector3 } from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import type { KeyBox } from "./keyBoxes";

export const RIM_LIGHT_LIMIT = 1;
const FRONT = new Vector3(0, 0, -1);
let initialized = false;

/** A continuous, forward-facing strip casts the rim's light down over keys and fingertips. */
export class ThreeRimLights {
  readonly group = new Group();
  private readonly light = new RectAreaLight(0xe5e7eb, 0, 1, 14);
  private readonly direction = new Vector3();

  constructor() {
    // Three's init allocates new LTC textures each time; the shared library lives across stages.
    if (!initialized) {
      RectAreaLightUniformsLib.init();
      initialized = true;
    }
    this.light.castShadow = false;
    this.group.add(this.light);
  }

  /** Parent transforms move the aperture; WebGLLights strips scale from its width/height axes. */
  layout(boxes: readonly KeyBox[], scale: number): void {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let back = 0;
    for (const box of boxes) {
      left = Math.min(left, box.x - box.width / 2);
      right = Math.max(right, box.x + box.width / 2);
      back = Math.max(back, box.back);
    }
    const span = boxes.length > 0 ? Math.max(0, right - left) : 0;
    const centre = span > 0 ? (left + right) / 2 : 0;
    this.light.position.set(centre, 58, -back);
    this.direction.set(0, 22 - 58, back - 52).normalize();
    this.light.quaternion.setFromUnitVectors(FRONT, this.direction);
    this.light.width = span * scale;
    this.light.height = 14 * scale;
    this.light.intensity = span > 0 ? 5.5 : 0;
  }

  dispose(): void {
    this.light.intensity = 0;
    this.group.removeFromParent();
    this.group.clear();
    // LTC textures are shared with other stages and are not owned by this light.
  }
}
