import { freeRoadPoint, type FreeRoadLane } from "../freeRoadLayout";
import { roadWorldPoint } from "../roadWidthWarp";
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial
} from "three";
import type { WorldCamera } from "../worldCamera";
import type { KeyBox } from "./keyBoxes";

export const ROAD_BEAT_GUIDE_LIMIT = 128;
const LANE_LIMIT = 89;
const DOCKED_SEGMENTS = 16;
const GUIDE_COLOR = 0x2f7bff;

function lines(positions: Float32Array, opacity: number): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute(
    "roadDockProgress",
    new BufferAttribute(new Float32Array(positions.length / 3), 1).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "roadDockAnchor",
    new BufferAttribute(new Float32Array(positions.length), 3).setUsage(DynamicDrawUsage)
  );
  geometry.setAttribute(
    "roadDockPitch",
    new BufferAttribute(new Float32Array(positions.length / 3), 1).setUsage(DynamicDrawUsage)
  );
  geometry.setDrawRange(0, 0);
  const material = new LineBasicMaterial({
    color: GUIDE_COLOR,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false
  });
  const result = new LineSegments(geometry, material);
  result.frustumCulled = false;
  return result;
}

/** Native road lanes and measure bars; inputs already carry the session's current beat depths. */
export class ThreeRoadGuides {
  readonly group = new Group();
  private readonly whitePositions = new Float32Array(LANE_LIMIT * 6 * DOCKED_SEGMENTS);
  private readonly blackPositions = new Float32Array(LANE_LIMIT * 6 * DOCKED_SEGMENTS);
  private readonly beatPositions = new Float32Array(ROAD_BEAT_GUIDE_LIMIT * 6 * (LANE_LIMIT - 1));
  private docked = false;
  private readonly anchorBuffers = new Map<Float32Array, BufferAttribute>();
  private readonly pitchBuffers = new Map<Float32Array, BufferAttribute>();
  private readonly progressBuffers = new Map<Float32Array, BufferAttribute>();
  private readonly whiteLanes = lines(this.whitePositions, 0.38);
  private readonly blackLanes = lines(this.blackPositions, 0.12);
  private readonly beats = lines(this.beatPositions, 0.4);
  private readonly sourcePositions = new BufferAttribute(new Float32Array(88 * 3), 3).setUsage(
    DynamicDrawUsage
  );
  private readonly sources = new Points(
    new BufferGeometry(),
    new PointsMaterial({
      color: 0xb9f7ff,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false
    })
  );
  private sourceRoutes: readonly FreeRoadLane[] | undefined;
  private sourceCount = 0;
  private boxes: readonly KeyBox[] | undefined;
  private camera: WorldCamera | undefined;
  private vertical = false;
  private routes: readonly FreeRoadLane[] | undefined;
  private whiteCount = 0;
  private blackCount = 0;
  private left = 0;
  private right = 0;
  private valid = false;
  private disposed = false;

  setDocked(on: boolean): void {
    if (this.docked === on) return;
    this.docked = on;
    this.camera = undefined;
  }
  constructor() {
    for (const [positions, item] of [
      [this.whitePositions, this.whiteLanes],
      [this.blackPositions, this.blackLanes],
      [this.beatPositions, this.beats]
    ] as const) {
      this.anchorBuffers.set(
        positions,
        item.geometry.getAttribute("roadDockAnchor") as BufferAttribute
      );
      this.pitchBuffers.set(
        positions,
        item.geometry.getAttribute("roadDockPitch") as BufferAttribute
      );
      this.progressBuffers.set(
        positions,
        item.geometry.getAttribute("roadDockProgress") as BufferAttribute
      );
    }
    this.sources.geometry.setAttribute(
      "roadDockAnchor",
      new BufferAttribute(new Float32Array(88 * 3), 3)
    );
    this.sources.geometry.setAttribute(
      "roadDockPitch",
      new BufferAttribute(new Float32Array(88), 1)
    );
    this.sources.geometry.setAttribute(
      "roadDockProgress",
      new BufferAttribute(new Float32Array(88).fill(1), 1)
    );
    this.sources.geometry.setAttribute("position", this.sourcePositions);
    this.sources.geometry.setDrawRange(0, 0);
    this.sources.frustumCulled = false;
    this.sources.visible = false;
    this.group.add(this.whiteLanes, this.blackLanes, this.beats, this.sources);
    this.group.visible = false;
  }

  /** Pan and keyboard placement belong to the shared parent, never to these vertices. */
  update(
    boxes: readonly KeyBox[],
    camera: WorldCamera,
    beatDepths: readonly number[],
    beatCount = beatDepths.length,
    vertical = false,
    routes?: readonly FreeRoadLane[]
  ): void {
    if (this.disposed) return;
    if (
      boxes !== this.boxes ||
      camera !== this.camera ||
      vertical !== this.vertical ||
      routes !== this.routes
    ) {
      this.vertical = vertical;
      this.routes = routes;
      this.layout(boxes, camera);
    }
    if (!this.valid) {
      this.clear();
      return;
    }
    this.group.visible = true;
    if (routes !== this.sourceRoutes) {
      this.sourceRoutes = routes;
      this.sourceCount = Math.min(88, routes?.length ?? 0);
      for (let index = 0; index < this.sourceCount; index++) {
        const point = routes?.[index]?.far;
        if (point) this.sourcePositions.setXYZ(index, point.x, point.y, point.z);
        this.sources.geometry
          .getAttribute("roadDockPitch")
          .setX(index, routes?.[index]?.pitch ?? 0);
      }
      this.sourcePositions.needsUpdate = true;
    }
    this.sources.visible = this.sourceCount > 0;
    this.sources.geometry.setDrawRange(0, this.sourceCount);
    this.whiteLanes.geometry.setDrawRange(0, this.whiteCount * 2);
    this.blackLanes.geometry.setDrawRange(0, this.blackCount * 2);
    const limit = Number.isFinite(beatCount)
      ? Math.max(0, Math.min(beatDepths.length, ROAD_BEAT_GUIDE_LIMIT, Math.floor(beatCount)))
      : 0;
    let used = 0;
    for (let index = 0; index < limit; index++) {
      const depth = beatDepths[index];
      if (
        depth === undefined ||
        !Number.isFinite(depth) ||
        depth < camera.near.z ||
        depth > camera.roadFarZ
      )
        continue;
      if (this.routes?.length) {
        const progress =
          (depth - camera.near.z) / Math.max(0.000001, camera.roadFarZ - camera.near.z);
        for (let lane = 1; lane < this.routes.length; lane++) {
          const left = this.routes[lane - 1],
            right = this.routes[lane];
          if (!left || !right) continue;
          const offset = used++ * 6;
          this.routePoint(this.beatPositions, offset, left, progress);
          this.routePoint(this.beatPositions, offset + 3, right, progress);
        }
      } else {
        const offset = used++ * 6;
        this.point(this.beatPositions, offset, this.left, depth, camera);
        this.point(this.beatPositions, offset + 3, this.right, depth, camera);
      }
    }
    this.beats.geometry.setDrawRange(0, used * 2);
    this.beats.geometry.getAttribute("position").needsUpdate = true;
    for (const attribute of this.progressBuffers.values()) attribute.needsUpdate = true;
    for (const attribute of this.pitchBuffers.values()) attribute.needsUpdate = true;
    for (const attribute of this.anchorBuffers.values()) attribute.needsUpdate = true;
    this.sources.geometry.getAttribute("roadDockPitch").needsUpdate = true;
  }

  private layout(boxes: readonly KeyBox[], camera: WorldCamera): void {
    this.boxes = boxes;
    this.camera = camera;
    this.whiteCount = 0;
    this.blackCount = 0;
    this.left = Infinity;
    this.right = -Infinity;
    const { near, roadFarZ } = camera;
    this.valid =
      Number.isFinite(near.y) &&
      Number.isFinite(near.z) &&
      Number.isFinite(roadFarZ) &&
      roadFarZ > near.z;
    if (!this.valid) return;
    for (const box of boxes) {
      if (!Number.isFinite(box.x) || !Number.isFinite(box.width) || box.width <= 0) continue;
      const left = box.x - box.width / 2;
      const right = box.x + box.width / 2;
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      this.left = Math.min(this.left, left);
      this.right = Math.max(this.right, right);
      const count = box.black ? this.blackCount : this.whiteCount;
      if (count < LANE_LIMIT * DOCKED_SEGMENTS) {
        const route = this.routes?.find((lane) => lane.pitch === box.pitch);
        if (route) {
          const positions = box.black ? this.blackPositions : this.whitePositions;
          const segments = this.docked ? DOCKED_SEGMENTS : 1;
          for (let i = 0; i < segments; i++) {
            const offset = (box.black ? this.blackCount++ : this.whiteCount++) * 6;
            this.routePoint(positions, offset, route, 1 - i / segments);
            this.routePoint(positions, offset + 3, route, 1 - (i + 1) / segments);
          }
        } else if (!this.routes?.length) this.lane(box.x, box.black, camera, box.pitch);
      }
    }
    this.valid = this.whiteCount + this.blackCount > 0 && this.right > this.left;
    if (!this.valid) return;
    this.whiteLanes.geometry.getAttribute("position").needsUpdate = true;
    this.blackLanes.geometry.getAttribute("position").needsUpdate = true;
  }

  private lane(x: number, black: boolean, camera: WorldCamera, pitch: number): void {
    const positions = black ? this.blackPositions : this.whitePositions;
    const contact = camera.roadWidth?.contacts?.[black ? 1 : 0] ?? camera.near;
    // A docked lane bends near the keys; enough segments follow the same blend as the notes.
    const segments = this.docked ? DOCKED_SEGMENTS : 1;
    for (let i = 0; i < segments; i++) {
      const offset = (black ? this.blackCount++ : this.whiteCount++) * 6;
      for (const [end, share] of [
        [0, 1 - i / segments],
        [3, 1 - (i + 1) / segments]
      ] as const) {
        const z = contact.z + share * (camera.roadFarZ - contact.z);
        this.point(positions, offset + end, x, z, camera, black, pitch);
      }
    }
  }

  private routePoint(
    positions: Float32Array,
    offset: number,
    lane: FreeRoadLane,
    progress: number
  ): void {
    const point = freeRoadPoint(lane, progress, 0, 0.025);
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
    this.progressBuffers.get(positions)?.setX(offset / 3, progress);
    this.pitchBuffers.get(positions)?.setX(offset / 3, lane.pitch);
    const anchor = freeRoadPoint(lane, 0, 0, 0.025);
    this.anchorBuffers.get(positions)?.setXYZ(offset / 3, anchor.x, anchor.y, anchor.z);
  }

  private point(
    positions: Float32Array,
    offset: number,
    x: number,
    z: number,
    camera: WorldCamera,
    black = false,
    pitch = 0
  ): void {
    const contact = camera.roadWidth?.contacts?.[black ? 1 : 0] ?? camera.near;
    const at = (depth: number) =>
      camera.roadWidth
        ? roadWorldPoint(
            camera.roadWidth,
            x,
            contact.y + 0.025,
            Math.max(depth, contact.z),
            contact.y,
            contact.z,
            this.vertical
          )
        : { x, y: camera.near.y + 0.025, z: depth };
    const point = at(z);
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = -point.z;
    const anchor = at(contact.z);
    this.anchorBuffers.get(positions)?.setXYZ(offset / 3, anchor.x, anchor.y, -anchor.z);
    this.pitchBuffers.get(positions)?.setX(offset / 3, pitch);
    this.progressBuffers
      .get(positions)
      ?.setX(offset / 3, (z - contact.z) / Math.max(0.000001, camera.roadFarZ - contact.z));
  }

  clear(): void {
    this.group.visible = false;
    this.sources.visible = false;
    this.sources.geometry.setDrawRange(0, 0);
    this.whiteLanes.geometry.setDrawRange(0, 0);
    this.blackLanes.geometry.setDrawRange(0, 0);
    this.beats.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.whiteLanes.geometry.dispose();
    this.blackLanes.geometry.dispose();
    this.beats.geometry.dispose();
    this.sources.geometry.dispose();
    this.sources.material.dispose();
    (this.whiteLanes.material as LineBasicMaterial).dispose();
    (this.blackLanes.material as LineBasicMaterial).dispose();
    (this.beats.material as LineBasicMaterial).dispose();
    this.group.clear();
    this.boxes = undefined;
    this.camera = undefined;
  }
}
