import type { PointData } from "./flatThree";
import { dockedScreenPoint } from "./dockedRoadProjection";
import type { KeyRect } from "./keyboardLayout";
import { metricCameraForKeys } from "./metricKeyboardCamera";
import { nativeKeyContactLanes } from "./nativeKeyContactAnchors";
import type { NoteLaneProjection } from "./noteLaneProjection";
import type { Projected } from "./perspective";
import { nativeViewCameras, type nativeNoteCameras } from "./nativeViewCameras";
import { nativeRoadCameraLayout } from "./nativeRoadCameraLayout";
import { roadLayoutCamera } from "./roadLayoutCamera";
import { roadNotePlace } from "./roadScenePoints";
import type { Geometry } from "./viewGeometry";
import { CAMERA_PRESETS, type CameraPrefs, type WorldCamera } from "./worldCamera";

/** The world road's fixed reference keyboard: the player's camera.* never reaches it. */
export const WORLD_REFERENCE_CAMERA: CameraPrefs = CAMERA_PRESETS.top;

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

/** The player's displayed keyboard and, given a reference geometry, the world road beside it. */
export function nativeRoadCameras(
  base: WorldCamera,
  keys: ReadonlyMap<number, KeyRect>,
  geometry: Geometry,
  reference: Geometry | undefined,
  options: Parameters<typeof worldRoadCameras>[2] & { readonly offset: PointData }
) {
  const cameras = nativeViewCameras(
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
  return { cameras, world: reference ? worldRoadCameras(keys, reference, options) : cameras };
}

/** The displayed keyboard's own note camera; the reference world road joins it at contact. */
export class ReferenceRoadDock {
  private cameras: ReturnType<typeof nativeNoteCameras> | undefined;
  private lanes: ReadonlyMap<number, NoteLaneProjection> | undefined;

  /** Without a laid-out dock the road keeps its plain world placement. */
  static place(
    dock: ReferenceRoadDock | undefined,
    docked: boolean,
    ...args: Parameters<typeof roadNotePlace>
  ): Projected | undefined {
    return dock ? dock.place(docked, ...args) : roadNotePlace(...args);
  }

  /** A moved keyboard changes only the contact of a docked world, else the whole road. */
  static moved(
    dock: ReferenceRoadDock | undefined,
    cameras: ReturnType<typeof nativeNoteCameras>,
    keys: ReadonlyMap<number, KeyRect> | undefined,
    width: number,
    fog: Parameters<typeof nativeRoadCameraLayout>[2]
  ): { hitY?: number } {
    const hitY = dock?.active && keys ? dock.set(cameras, keys, width) : undefined;
    return hitY === undefined ? nativeRoadCameraLayout(cameras, width, fog) : { hitY };
  }

  get active(): boolean {
    return this.cameras !== undefined;
  }

  /** The road's layout from the world camera, with the hit row of the shown keys. */
  layout(
    world: ReturnType<typeof nativeNoteCameras>,
    cameras: ReturnType<typeof nativeNoteCameras>,
    keys: ReadonlyMap<number, KeyRect>,
    width: number,
    fog: Parameters<typeof nativeRoadCameraLayout>[2]
  ) {
    const layout = nativeRoadCameraLayout(world, width, fog);
    const hitY = this.set(world === cameras ? undefined : cameras, keys, width);
    return hitY === undefined ? layout : { ...layout, hitY };
  }

  /** Returns the shown keys' hit row while docked. */
  set(
    cameras: ReturnType<typeof nativeNoteCameras> | undefined,
    keys: ReadonlyMap<number, KeyRect>,
    viewWidth: number
  ): number | undefined {
    this.cameras = cameras;
    this.lanes = cameras && nativeKeyContactLanes(keys, cameras.blackLane, cameras.whiteLane);
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
    return anchor && pinned
      ? dockedScreenPoint(point, anchor, pinned, 1 - Math.max(0, Math.min(1, y / height)))
      : point;
  }
}
