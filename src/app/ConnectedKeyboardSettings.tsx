import { shallowEqual } from "react-redux";
import { KeyboardSettings } from "../ui/settings/KeyboardSettings";
import { pianistAvailable } from "../render/three/pianistAvailability";
import { useAppSelector } from "./storeHooks";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
import { useRuntimeCommand } from "./runtimeCommands";

export function ConnectedKeyboardSettings() {
  const state = useAppSelector(
    (state) => ({
      keyStyle: state.preferences.staff.keyStyle,
      notesPerspective: state.preferences.staff.road,
      freeRoadLayout: state.preferences.staff.road
        ? state.preferences.staff.freePerspectiveField
        : state.preferences.staff.freeDirectField,
      fallingNoteStyle: state.preferences.staff.fallingNoteStyle,
      noteProjection: state.preferences.staff.noteProjection,
      handStyle: state.preferences.staff.handStyle,
      flatNoteBurning: state.preferences.staff.flatNoteBurning,
      flatPressEffects: state.preferences.staff.flatPressEffects,
      noteParticles: state.preferences.staff.noteParticles,
      keyboardDim: state.preferences.staff.keyboardDim,
      roadGuides: state.preferences.staff.roadGuides,
      pianist: state.preferences.staff.pianist,
      performanceScene: state.preferences.staff.performanceScene,
      freeCamera: state.preferences.staff.freeCamera,
      freeCameraWasd: state.preferences.staff.freeCameraWasd,
      far: state.preferences.staff.roadFar,
      horizon: state.preferences.staff.roadHorizon,
      camera: state.preferences.staff.camera
    }),
    shallowEqual
  );
  const view = useRuntimeSelector(
    (runtime) => ({ keyRange: runtime.view.keyRange, showLabels: runtime.view.showLabels }),
    shallowEqual
  );
  const onKeyRange = useRuntimeCommand((runtime) => runtime.view.setKeyRange);
  const onShowLabels = useRuntimeCommand((runtime) => runtime.view.setShowLabels);
  const onKeyStyle = useRuntimeCommand((runtime) => runtime.keyboardSettings.onKeyStyle);
  const onNotesPerspective = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onNotesPerspective
  );
  const onFallingNoteStyle = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onFallingNoteStyle
  );
  const onNoteProjection = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onNoteProjection
  );
  const onFreeRoadLayout = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onFreeRoadLayout
  );
  const onHandStyle = useRuntimeCommand((runtime) => runtime.keyboardSettings.onHandStyle);
  const onFlatNoteBurning = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onFlatNoteBurning
  );
  const onFlatPressEffects = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onFlatPressEffects
  );
  const onNoteParticles = useRuntimeCommand((runtime) => runtime.keyboardSettings.onNoteParticles);
  const onKeyboardDim = useRuntimeCommand((runtime) => runtime.keyboardSettings.onKeyboardDim);
  const onRoadGuides = useRuntimeCommand((runtime) => runtime.keyboardSettings.onRoadGuides);
  const onPerformanceScene = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onPerformanceScene
  );
  const onFreeCamera = useRuntimeCommand((runtime) => runtime.keyboardSettings.onFreeCamera);
  const onFreeCameraWasd = useRuntimeCommand(
    (runtime) => runtime.keyboardSettings.onFreeCameraWasd
  );
  const onPianist = useRuntimeCommand((runtime) => runtime.keyboardSettings.onPianist);
  const onRoad = useRuntimeCommand((runtime) => runtime.keyboardSettings.onRoad);
  const onCamera = useRuntimeCommand((runtime) => runtime.keyboardSettings.onCamera);
  return (
    <KeyboardSettings
      {...view}
      keyStyle={state.keyStyle}
      notesPerspective={state.notesPerspective}
      freeRoadLayout={state.freeRoadLayout}
      onFreeRoadLayout={onFreeRoadLayout}
      onNotesPerspective={onNotesPerspective}
      fallingNoteStyle={state.fallingNoteStyle}
      noteProjection={state.noteProjection}
      onNoteProjection={onNoteProjection}
      onFallingNoteStyle={onFallingNoteStyle}
      handStyle={state.handStyle}
      flatNoteBurning={state.flatNoteBurning}
      onFlatNoteBurning={onFlatNoteBurning}
      flatPressEffects={state.flatPressEffects}
      onFlatPressEffects={onFlatPressEffects}
      noteParticles={state.noteParticles}
      onNoteParticles={onNoteParticles}
      keyboardDim={state.keyboardDim}
      onKeyboardDim={onKeyboardDim}
      roadGuides={state.roadGuides}
      {...(pianistAvailable(state.keyStyle) ? { pianist: state.pianist } : {})}
      onPianist={onPianist}
      performanceScene={state.performanceScene}
      onPerformanceScene={onPerformanceScene}
      freeCamera={state.freeCamera}
      freeCameraWasd={state.freeCameraWasd}
      onFreeCameraWasd={onFreeCameraWasd}
      onFreeCamera={onFreeCamera}
      road={{ far: state.far, horizon: state.horizon }}
      camera={state.camera}
      onKeyRange={onKeyRange}
      onShowLabels={onShowLabels}
      onKeyStyle={onKeyStyle}
      onHandStyle={onHandStyle}
      onRoadGuides={onRoadGuides}
      onRoad={onRoad}
      onCamera={onCamera}
    />
  );
}
