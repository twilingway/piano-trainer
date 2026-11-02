export type NativeLightingProfile = "full" | "mobile";

/** Keep pointer detection in the shell; the lighting decision never mutates saved view settings. */
export function nativeLightingProfile(primaryPointerCoarse = false): NativeLightingProfile {
  return primaryPointerCoarse ? "mobile" : "full";
}
