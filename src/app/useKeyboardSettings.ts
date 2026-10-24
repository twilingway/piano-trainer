import type { ComponentProps } from "react";

import { pianistAvailable } from "../render/three/pianistAvailability";
import type { KeyboardSettings } from "../ui/settings/KeyboardSettings";
import type { useFallingView } from "./useFallingView";
import type { StaffPrefs } from "./useStaffPrefs";

type FallingView = ReturnType<typeof useFallingView>;

/** The settings' keyboard section: the keys, their look, the hands', the road and the camera. */
export function useKeyboardSettings(
  view: Pick<FallingView, "keyRange" | "setKeyRange" | "showLabels" | "setShowLabels">,
  staffPrefs: StaffPrefs,
  updateStaffPrefs: (change: Partial<StaffPrefs>) => void
): ComponentProps<typeof KeyboardSettings> & {
  onNoteProjection: NonNullable<ComponentProps<typeof KeyboardSettings>["onNoteProjection"]>;
  fps: boolean;
  onFps: (show: boolean) => void;
  onPianist: (on: boolean) => void;
  onFreeCamera: (on: boolean) => void;
  onFreeCameraWasd: (on: boolean) => void;
  onPerformanceScene: (on: boolean) => void;
} {
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
      updateStaffPrefs({ keyStyle });
    },
    fallingNoteStyle: staffPrefs.fallingNoteStyle,
    noteProjection: staffPrefs.noteProjection,
    onNoteProjection: (noteProjection) => {
      updateStaffPrefs({ noteProjection });
    },
    onFallingNoteStyle: (fallingNoteStyle) => {
      updateStaffPrefs({ fallingNoteStyle });
    },
    notesPerspective: staffPrefs.road,
    freeRoadLayout: staffPrefs.road ? staffPrefs.freePerspectiveField : staffPrefs.freeDirectField,
    onFreeRoadLayout: (change) => {
      const key = staffPrefs.road ? "freePerspectiveField" : "freeDirectField";
      updateStaffPrefs({ [key]: { ...staffPrefs[key], ...change } });
    },
    onNotesPerspective: (road) => {
      updateStaffPrefs({ road });
    },
    handStyle: staffPrefs.handStyle,
    flatNoteBurning: staffPrefs.flatNoteBurning,
    onFlatNoteBurning: (flatNoteBurning) => {
      updateStaffPrefs({ flatNoteBurning });
    },
    flatPressEffects: staffPrefs.flatPressEffects,
    onFlatPressEffects: (flatPressEffects) => {
      updateStaffPrefs({ flatPressEffects });
    },
    noteParticles: staffPrefs.noteParticles,
    onNoteParticles: (noteParticles) => {
      updateStaffPrefs({ noteParticles });
    },
    keyboardDim: staffPrefs.keyboardDim,
    onKeyboardDim: (keyboardDim) => {
      updateStaffPrefs({ keyboardDim });
    },
    ...(pianistAvailable(staffPrefs.keyStyle) ? { pianist: staffPrefs.pianist } : {}),
    onPianist: (pianist) => {
      updateStaffPrefs({ pianist });
    },
    performanceScene: staffPrefs.performanceScene,
    onPerformanceScene: (performanceScene) => {
      updateStaffPrefs({ performanceScene });
    },
    freeCamera: staffPrefs.freeCamera,
    freeCameraWasd: staffPrefs.freeCameraWasd,
    onFreeCameraWasd: (freeCameraWasd) => {
      updateStaffPrefs({ freeCameraWasd });
    },
    onFreeCamera: (freeCamera) => {
      updateStaffPrefs({ freeCamera });
    },
    roadGuides: staffPrefs.roadGuides,
    onRoadGuides: (roadGuides) => {
      updateStaffPrefs({ roadGuides });
    },
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
    }
  };
}
