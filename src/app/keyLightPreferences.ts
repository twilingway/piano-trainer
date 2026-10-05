import { DEFAULT_KEY_LIGHTS } from "../input/keyLights";
import type { KeyLightSettings } from "../input/keyLights";
const STORAGE_KEY = "key-lights-v1";
const inRange = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;
/** The stored key lights; each damaged or out-of-range field falls back on its own. */
export function loadKeyLights(): KeyLightSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null) return DEFAULT_KEY_LIGHTS;
    const { enabled, channel, velocity } = stored as Record<string, unknown>;
    return {
      enabled: typeof enabled === "boolean" ? enabled : DEFAULT_KEY_LIGHTS.enabled,
      channel: inRange(channel, 1, 16) ? channel : DEFAULT_KEY_LIGHTS.channel,
      velocity: inRange(velocity, 1, 127) ? velocity : DEFAULT_KEY_LIGHTS.velocity
    };
  } catch {
    return DEFAULT_KEY_LIGHTS;
  }
}
export function saveKeyLights(settings: KeyLightSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* Storage is optional. */
  }
}
