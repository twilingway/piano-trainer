import type { ComponentProps, ReactNode } from "react";

import type { PlayerSettings } from "../ui/settings/PlayerSettings";
import type { useFallingView } from "./useFallingView";
import type { StaffPrefs } from "./useStaffPrefs";

type FallingView = ReturnType<typeof useFallingView>;

/** The settings' keyboard section: the keys, their look, the hands', the road and the camera. */
export function useKeyboardSettings(
  view: Pick<FallingView, "keyRange" | "setKeyRange" | "showLabels" | "setShowLabels">,
  staffPrefs: StaffPrefs,
  updateStaffPrefs: (change: Partial<StaffPrefs>) => void,
  toggles: ReactNode
): ComponentProps<typeof PlayerSettings>["keyboard"] {
  return {
    keyRange: view.keyRange,
    onKeyRange: view.setKeyRange,
    showLabels: view.showLabels,
    onShowLabels: view.setShowLabels,
    fps: staffPrefs.fps,
    onFps: (fps) => {
      updateStaffPrefs({ fps });
    },
    keyStyle: staffPrefs.keyStyle,
    onKeyStyle: (keyStyle) => {
      updateStaffPrefs({ keyStyle, ...(keyStyle === "perspective" ? { road: true } : {}) });
    },
    handStyle: staffPrefs.handStyle,
    onHandStyle: (handStyle) => {
      updateStaffPrefs({ handStyle });
    },
    road: { far: staffPrefs.roadFar, horizon: staffPrefs.roadHorizon },
    onRoad: (road) => {
      updateStaffPrefs({
        ...(road.far === undefined ? {} : { roadFar: road.far }),
        ...(road.horizon === undefined ? {} : { roadHorizon: road.horizon })
      });
    },
    camera: staffPrefs.camera,
    onCamera: (camera) => {
      updateStaffPrefs({ camera });
    },
    toggles
  };
}
