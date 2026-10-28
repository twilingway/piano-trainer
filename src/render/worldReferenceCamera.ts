import type { PointData } from "./flatThree";
import { dockedScreenPoint } from "./dockedRoadProjection";
import type { KeyRect } from "./keyboardLayout";
import { metricCameraForKeys } from "./metricKeyboardCamera";
import { nativeKeyContactLanes } from "./nativeKeyContactAnchors";
import type { NoteLaneProjection } from "./noteLaneProjection";
import type { Projected } from "./perspective";
import { nativeNoteCameras, nativeViewCameras } from "./nativeViewCameras";
import { nativeRoadCameraLayout } from "./nativeRoadCameraLayout";
import { roadLayoutCamera, type RoadFit } from "./roadLayoutCamera";
import { roadNotePlace } from "./roadScenePoints";
import type { Geometry } from "./viewGeometry";
import { CAMERA_PRESETS, type CameraPrefs, type WorldCamera } from "./worldCamera";

/** The world road's fixed reference keyboard: the player's camera.* never reaches it. */
export const WORLD_REFERENCE_CAMERA: CameraPrefs = CAMERA_PRESETS.top;

type NoteCameras = ReturnType<typeof nativeNoteCameras>;
/** A snapshot keyboard's note cameras and their recalibration for a moved keyboard. */
type FitCameras = NoteCameras & {
  readonly keyboard: WorldCamera;
  readonly refit: (offset: PointData) => NoteCameras;
};

/**
 * The standard composition's world road, derived from the reference keyboard on the same viewport,
 * range and placement. Horizon and width at the horizon count from this reference line; the
 * displayed keyboard joins it only through the docked near quarter.
 */
export function worldRoadCameras(
  keys: ReadonlyMap<number, KeyRect>,
  reference: Geometry,
  options: {
    readonly viewWidth: number;
    readonly sceneWidth: number;
    readonly cameraHeight: number;
    readonly viewportHeight: number;
    readonly horizon: number;
    readonly far: number;
    readonly overhead: boolean;
    readonly perspective: boolean;
    readonly dock: boolean;
    readonly nativeScale?: number | undefined;
  }
) {
  const { viewWidth, sceneWidth, cameraHeight, horizon } = options;
  const base = metricCameraForKeys(
    roadLayoutCamera(viewWidth, sceneWidth, cameraHeight, WORLD_REFERENCE_CAMERA, true, horizon),
    keys,
    cameraHeight,
    horizon
  );
  return nativeViewCameras(
    base,
    reference.keyboardHeight,
    options.overhead,
    options.perspective,
    cameraHeight,
    horizon,
    options.viewportHeight,
    options.dock ? reference.keyboardTop + reference.keyboardHeight : undefined,
    { x: 0, y: 0 },
    options.far,
    sceneWidth,
    options.nativeScale
  );
}

/** What the standard road straightens onto: the shown keyboard or a snapshot of its camera. */
export type RoadFitTarget =
  "keyboard" | { readonly prefs: CameraPrefs; readonly geometry: Geometry } | undefined;

/** The world road's reference geometry and what the standard road straightens onto. */
export interface RoadReference {
  readonly geometry: Geometry;
  readonly fit?: RoadFitTarget;
  /** How far the straightened road follows the keyboard's perspective: 0 world direction, 1 full. */
  readonly tilt?: number | undefined;
}
/** The straightening target with its tilt, as the dock takes it. */
interface DockFit {
  readonly source: FitCameras | "keyboard";
  readonly tilt: number;
}

/** The layout's straightening target for a road fit. */
export function roadFitTarget(
  fit: RoadFit | undefined,
  geometry: (prefs: CameraPrefs) => Geometry
): RoadFitTarget {
  if (fit?.mode === "auto") return "keyboard";
  return fit?.camera && { prefs: fit.camera, geometry: geometry(fit.camera) };
}

type RoadCameraOptions = Parameters<typeof worldRoadCameras>[2] & { readonly offset: PointData };

/** One keyboard's cameras on this view; the snapshot keyboard shares every option but its own. */
function keyboardRoadCameras(base: WorldCamera, geometry: Geometry, options: RoadCameraOptions) {
  return nativeViewCameras(
    base,
    geometry.keyboardHeight,
    options.overhead,
    options.perspective,
    options.cameraHeight,
    options.horizon,
    options.viewportHeight,
    options.dock ? geometry.keyboardTop + geometry.keyboardHeight : undefined,
    options.offset,
    options.far,
    options.sceneWidth,
    options.nativeScale
  );
}

function snapshotRoadCameras(
  prefs: CameraPrefs,
  keys: ReadonlyMap<number, KeyRect>,
  geometry: Geometry,
  options: RoadCameraOptions
): FitCameras {
  const { viewWidth, sceneWidth, cameraHeight, horizon } = options;
  const base = metricCameraForKeys(
    roadLayoutCamera(viewWidth, sceneWidth, cameraHeight, prefs, true, horizon),
    keys,
    cameraHeight,
    horizon
  );
  const cameras = keyboardRoadCameras(base, geometry, options);
  const refit = (offset: PointData) =>
    nativeNoteCameras(
      cameras.keyboard,
      options.perspective,
      cameraHeight,
      horizon,
      options.viewportHeight,
      offset,
      options.far,
      sceneWidth
    );
  return { ...cameras, refit };
}

/** The player's displayed keyboard and, given a reference geometry, the world road beside it. */
export function nativeRoadCameras(
  base: WorldCamera,
  keys: ReadonlyMap<number, KeyRect>,
  geometry: Geometry,
  reference: RoadReference | undefined,
  options: RoadCameraOptions
) {
  const cameras = keyboardRoadCameras(base, geometry, options);
  const fit = reference?.fit;
  const source =
    fit === "keyboard" || !fit ? fit : snapshotRoadCameras(fit.prefs, keys, fit.geometry, options);
  return {
    cameras,
    world: reference ? worldRoadCameras(keys, reference.geometry, options) : cameras,
    fit: source && { source, tilt: reference?.tilt ?? 0 }
  };
}

/** The displayed keyboard's own note camera; the reference world road joins it at contact. */
export class ReferenceRoadDock {
  private cameras: NoteCameras | undefined;
  private lanes: ReadonlyMap<number, NoteLaneProjection> | undefined;
  private fit: NoteCameras | undefined;
  private fitLanes: ReadonlyMap<number, NoteLaneProjection> | undefined;
  private fitSource: FitCameras | "keyboard" | undefined;
  private tilt = 0;
  private keys: ReadonlyMap<number, KeyRect> | undefined;

  /** Without a laid-out dock the road keeps its plain world placement. */
  static place(
    dock: ReferenceRoadDock | undefined,
    docked: boolean,
    ...args: Parameters<typeof roadNotePlace>
  ): Projected | undefined {
    return dock ? dock.place(docked, ...args) : roadNotePlace(...args);
  }

  /** A moved keyboard recalibrates the shown and the fitted contacts with the same offset. */
  static moved(
    dock: ReferenceRoadDock | undefined,
    cameras: NoteCameras,
    width: number,
    fog: Parameters<typeof nativeRoadCameraLayout>[2],
    offset: PointData
  ): { hitY?: number } {
    const source = dock?.fitSource;
    const fit = source === "keyboard" ? cameras : source?.refit(offset);
    const keys = dock?.active ? dock.keys : undefined;
    const hitY = keys ? dock?.set(cameras, keys, width, fit) : undefined;
    return hitY === undefined ? nativeRoadCameraLayout(cameras, width, fog) : { hitY };
  }

  /** The keyboard the standard road straightens onto, for the three road pass. */
  get fitKeyboard(): { camera: WorldCamera | "keyboard"; tilt: number } | undefined {
    const camera =
      this.cameras && (this.fitSource === "keyboard" ? "keyboard" : this.fitSource?.keyboard);
    return camera && { camera, tilt: this.tilt };
  }

  get active(): boolean {
    return this.cameras !== undefined;
  }

  /** The road's layout from the world camera, with the hit row of the shown keys. */
  layout(
    world: NoteCameras,
    cameras: NoteCameras,
    keys: ReadonlyMap<number, KeyRect>,
    width: number,
    fog: Parameters<typeof nativeRoadCameraLayout>[2],
    fit?: DockFit
  ) {
    const layout = nativeRoadCameraLayout(world, width, fog);
    const source = fit?.source;
    this.fitSource = source;
    this.tilt = fit?.tilt ?? 0;
    const shown = world === cameras ? undefined : cameras;
    const hitY = this.set(shown, keys, width, source === "keyboard" ? cameras : source);
    return hitY === undefined ? layout : { ...layout, hitY };
  }

  /** Returns the shown keys' hit row while docked; `fit` straightens the route onto its keys. */
  set(
    cameras: NoteCameras | undefined,
    keys: ReadonlyMap<number, KeyRect>,
    viewWidth: number,
    fit?: NoteCameras
  ): number | undefined {
    this.cameras = cameras;
    this.keys = keys;
    this.lanes = cameras && nativeKeyContactLanes(keys, cameras.blackLane, cameras.whiteLane);
    this.fit = cameras && fit;
    this.fitLanes =
      fit === cameras
        ? this.lanes
        : this.fit && nativeKeyContactLanes(keys, this.fit.blackLane, this.fit.whiteLane);
    return cameras?.notes.road.at(viewWidth / 2, 1).y;
  }

  /** The world point plus the contact delta, fading out over the near quarter. */
  place(docked: boolean, ...args: Parameters<typeof roadNotePlace>): Projected | undefined {
    const point = roadNotePlace(...args),
      notes = docked ? this.cameras?.notes : undefined;
    if (!point || !notes) return point;
    const [camera, projection, height, pan, keyX, y, offset, lift, lane, keyHeight] = args;
    const anchor = roadNotePlace(
      camera,
      projection,
      height,
      pan,
      keyX,
      height,
      offset,
      lift,
      lane,
      keyHeight
    );
    const pinned = roadNotePlace(
      notes,
      notes.road,
      height,
      pan,
      keyX,
      height,
      offset,
      lift,
      this.lanes?.get(keyX),
      keyHeight
    );
    const fit = this.fit?.notes;
    const fitted =
      fit === notes
        ? pinned
        : fit &&
          roadNotePlace(
            fit,
            fit.road,
            height,
            pan,
            keyX,
            height,
            offset,
            lift,
            this.fitLanes?.get(keyX),
            keyHeight
          );
    // The lane's own keyboard projection at this row: the direction the bent join leaves the key.
    const keyboard = roadNotePlace(
      notes,
      notes.road,
      height,
      pan,
      keyX,
      y,
      offset,
      lift,
      this.lanes?.get(keyX),
      keyHeight
    );
    return anchor && pinned
      ? dockedScreenPoint(
          point,
          anchor,
          pinned,
          1 - Math.max(0, Math.min(1, y / height)),
          fitted,
          keyboard,
          height,
          this.tilt
        )
      : point;
  }
}
