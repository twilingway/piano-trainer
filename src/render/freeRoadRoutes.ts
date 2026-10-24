import { freeRoadLanes, type FreeRoadLayout, type FreeRoadLane } from "./freeRoadLayout";
import type { KeyRect } from "./keyboardLayout";
import type { WorldCamera } from "./worldCamera";
import { nativeKeyContactLanes } from "./nativeKeyContactAnchors";
import type { NoteLaneProjection } from "./noteLaneProjection";

/** Rebuild only structural geometry; never sample future notes to decide the field's bounds. */
export class FreeRoadRoutes {
  lanes: readonly FreeRoadLane[] = [];
  contacts: ReadonlyMap<number, NoteLaneProjection> = new Map();
  private keys: ReadonlyMap<number, KeyRect> | undefined;
  private camera: WorldCamera | undefined;
  private layout: FreeRoadLayout | undefined;

  update(keys: ReadonlyMap<number, KeyRect>, camera: WorldCamera, layout: FreeRoadLayout): void {
    if (this.keys === keys && this.camera === camera && this.layout === layout) return;
    this.keys = keys;
    this.camera = camera;
    this.layout = layout;
    const contacts = nativeKeyContactLanes(keys, undefined);
    const inputs = [...keys.values()].map((key) => {
      const lane = contacts.get(key.x + key.width / 2);
      return {
        pitch: key.pitch,
        width: key.width * (camera.params.sourceUnits ?? 0.5),
        near: {
          x: camera.sourceX(key.x + key.width / 2) + (lane?.worldOffsetX ?? 0),
          y: lane?.y ?? 22,
          z: -(lane?.depth ?? camera.near.z)
        }
      };
    });
    this.lanes = freeRoadLanes(inputs, layout);
    const routesByPitch = new Map(this.lanes.map((lane) => [lane.pitch, lane]));
    for (const key of keys.values()) {
      const x = key.x + key.width / 2,
        lane = contacts.get(x),
        route = routesByPitch.get(key.pitch);
      if (lane && route) contacts.set(x, { ...lane, freeFar: route.far });
    }
    this.contacts = contacts;
  }
}
