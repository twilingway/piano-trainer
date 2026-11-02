import type { KeyRect } from "./keyboardLayout";
import type { NoteLaneProjection } from "./noteLaneProjection";
import { BLACK_NOTE_FLOOR, WHITE_NOTE_FLOOR } from "./noteDimensions";

/** Rear edge of the published black horizontal top, before its rounded bevel. */
export const NATIVE_BLACK_CONTACT_BACK = 145.8;
export const NATIVE_WHITE_CONTACT_BACK = 149.1938;

/** Published keyboard88.glb rear white stems; the wide front remains on metricKeyX. */
export function nativeKeyContactOffsetX(pitch: number): number {
  if (pitch === 108) return 0;
  const degree = ((pitch % 12) + 12) % 12;
  if (degree === 0 || degree === 5 || pitch === 21) return -3.575;
  return degree === 4 || degree === 11 ? 3.575 : 0;
}

/** World-space offsets travel with every note layer, including the single inspection camera. */
export function nativeKeyContactLanes(
  keys: ReadonlyMap<number, KeyRect>,
  blackLane: NoteLaneProjection | undefined,
  whiteLane?: NoteLaneProjection
): Map<number, NoteLaneProjection> {
  const lanes = new Map<number, NoteLaneProjection>();
  for (const key of keys.values()) {
    const worldOffsetX = nativeKeyContactOffsetX(key.pitch);
    const base = key.black ? blackLane : whiteLane;
    lanes.set(key.x + key.width / 2, {
      y: key.black ? BLACK_NOTE_FLOOR : WHITE_NOTE_FLOOR,
      scaleX: 1,
      offsetX: 0,
      offsetY: 0,
      width: 1,
      height: 1,
      depth: key.black ? NATIVE_BLACK_CONTACT_BACK : NATIVE_WHITE_CONTACT_BACK,
      ...base,
      worldOffsetX
    });
  }
  return lanes;
}

/** The same metric contact is used by the scene's flame, burst and rising note effects. */
export function nativeKeyContactPoint(
  key: {
    readonly pitch: number;
    readonly black: boolean;
    readonly metric?: boolean;
    readonly x: number;
    readonly top: number;
  },
  nearZ: number
): { x: number; y: number; z: number } {
  return {
    x: key.x + (key.metric ? nativeKeyContactOffsetX(key.pitch) : 0),
    y: key.top,
    z: -(key.metric ? (key.black ? NATIVE_BLACK_CONTACT_BACK : NATIVE_WHITE_CONTACT_BACK) : nearZ)
  };
}
