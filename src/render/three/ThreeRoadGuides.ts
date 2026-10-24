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
const GUIDE_COLOR = 0x2f7bff;

function lines(positions: Float32Array, opacity: number): LineSegments {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
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
  private readonly whitePositions = new Float32Array(LANE_LIMIT * 6);
  private readonly blackPositions = new Float32Array(LANE_LIMIT * 6);
  private readonly beatPositions = new Float32Array(ROAD_BEAT_GUIDE_LIMIT * 6 * (LANE_LIMIT - 1));
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

  constructor() {
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
      if (count < LANE_LIMIT) {
        const route = this.routes?.find((lane) => lane.pitch === box.pitch);
        if (route) {
          const positions = box.black ? this.blackPositions : this.whitePositions;
          const offset = (box.black ? this.blackCount++ : this.whiteCount++) * 6;
          this.routePoint(positions, offset, route, 1);
          this.routePoint(positions, offset + 3, route, 0);
        } else if (!this.routes?.length) this.lane(box.x, box.black, camera);
      }
    }
    this.valid = this.whiteCount + this.blackCount > 0 && this.right > this.left;
    if (!this.valid) return;
    this.whiteLanes.geometry.getAttribute("position").needsUpdate = true;
    this.blackLanes.geometry.getAttribute("position").needsUpdate = true;
  }

  private lane(x: number, black: boolean, camera: WorldCamera): void {
    const positions = black ? this.blackPositions : this.whitePositions;
    const offset = (black ? this.blackCount++ : this.whiteCount++) * 6;
    this.point(positions, offset, x, camera.roadFarZ, camera, black);
    this.point(positions, offset + 3, x, camera.near.z, camera, black);
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
  }

  private point(
    positions: Float32Array,
    offset: number,
    x: number,
    z: number,
    camera: WorldCamera,
    black = false
  ): void {
    const contact = camera.roadWidth?.contacts?.[black ? 1 : 0] ?? camera.near;
    const point = camera.roadWidth
      ? roadWorldPoint(
          camera.roadWidth,
          x,
          contact.y + 0.025,
          Math.max(z, contact.z),
          contact.y,
          contact.z,
          this.vertical
        )
      : { x, y: camera.near.y + 0.025, z };
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = -point.z;
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
