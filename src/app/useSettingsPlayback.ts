import { useLayoutEffect } from "react";
import type { usePlayCountdown } from "./usePlayCountdown";

type Countdown = ReturnType<typeof usePlayCountdown>;
interface CaptureState {
  readonly editing: boolean;
  readonly capturing: boolean;
}

/** Keep explicit song controls available without unlocking course input or calibration. */
export function useSettingsPlayback(
  countdown: Countdown,
  settingsOpen: boolean,
  practiceActive: boolean,
  playing: boolean,
  capture: CaptureState,
  calibrating: boolean
) {
  const blocked =
    settingsOpen && (practiceActive || capture.editing || capture.capturing || calibrating);
  const cancel = countdown.cancel;
  useLayoutEffect(() => {
    if (blocked) cancel();
  }, [blocked, cancel]);
  return () => {
    if (playing || countdown.active || !blocked) countdown.toggle();
  };
}
