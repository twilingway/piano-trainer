import { useMemo } from "react";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import { FREE_CAMERA_CODES } from "../input/freeCameraMovement";
import type { StaffPrefs } from "./staffPreferences";

/** The camera and piano reserve exactly the same keys for the effective view. */
export function useFreeCameraInput(
  prefs: StaffPrefs,
  options: KeyboardInputOptions,
  blocked: boolean
) {
  const enabled =
    prefs.keyStyle === "3d" &&
    prefs.keys &&
    prefs.freeCamera &&
    prefs.freeCameraWasd &&
    !prefs.performanceScene &&
    !blocked;
  const keyboard = useMemo(
    () =>
      blocked
        ? { ...options, blocked: true }
        : enabled
          ? { ...options, reservedCodes: FREE_CAMERA_CODES }
          : options,
    [blocked, enabled, options]
  );
  return { enabled, keyboard };
}
