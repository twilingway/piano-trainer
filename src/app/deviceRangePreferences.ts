import { DEFAULT_DEVICE_RANGE, parseDeviceRange } from "../input/deviceRange";
import type { DeviceRange } from "../input/deviceRange";
const STORAGE_KEY = "device-range-v1";
export function loadDeviceRange(): DeviceRange {
  try {
    return parseDeviceRange(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_DEVICE_RANGE;
  }
}
export function saveDeviceRange(range: DeviceRange): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  } catch {
    /* Storage is optional. */
  }
}
