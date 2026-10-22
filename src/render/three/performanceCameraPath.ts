import { performanceOpeningBank, performanceTopPosition } from "./performanceCameraGeometry";
import { boundsCentre, performanceRouteAnchors } from "./performanceRouteAnchors";
import { performanceShortRoute } from "./performanceShortRoute";
import { performanceOpeningSeconds, performanceShortSong } from "./performanceSceneTimeline";
import { cameraOrientation } from "./performanceCameraOrientation";
import { cameraCurvePoint, cameraCurveVelocity, cameraFlowNodes } from "./performanceCameraCurve";
import { performanceHeroFlight } from "./performanceHeroFlight";
import type {
  PerformanceCameraNode as Node,
  PerformanceCameraGeometry,
  PerformanceCameraPose
} from "./performanceCameraTypes";
import {
  performanceRoadFlightLook,
  performanceRoadPoint,
  PERFORMANCE_ROAD_TILT
} from "./performanceRoadProjection";
import {
  distance,
  inside,
  mix,
  point,
  pointMix,
  quintic,
  segmentBlocked
} from "./performanceCameraMath";
import type { CameraPoint } from "./performanceCameraMath";

export type {
  PerformanceCameraRoad,
  PerformanceCameraGeometry,
  PerformanceCameraPose
} from "./performanceCameraTypes";
const FLIGHT_START = 22;
/** A short song's route is stretched to this length so its shots stay two seconds apart. */
const SHORT_ROUTE_SECONDS = 25;

/** A prevalidated physical path. Sampling never integrates time or scans scene meshes. */
export class PerformanceCameraPath {
  private readonly nodes: readonly Node[];
  readonly duration: number;
  /** Song seconds of the opening; the route starts where it ends. */
  readonly opening: number;
  readonly clearance: number;
  readonly detours: number;

  constructor(readonly geometry: PerformanceCameraGeometry) {
    this.clearance = Math.max(10 * geometry.unit, geometry.handSpan * 0.035);
    const songDuration =
      geometry.duration !== undefined && Number.isFinite(geometry.duration)
        ? geometry.duration
        : undefined;
    const short = performanceShortSong(songDuration ?? Infinity);
    this.opening = performanceOpeningSeconds(songDuration ?? Infinity);
    this.duration =
      songDuration === undefined ? 154.5 : Math.max(short ? SHORT_ROUTE_SECONDS : 30, songDuration);
    const route = short ? this.buildShortRoute() : this.buildLongRoute();
    const protectedRoute = this.protect([
      {
        time: this.opening,
        position: { ...geometry.top },
        target: boundsCentre(geometry.bounds),
        fov: 45,
        shot: "rise",
        bank: performanceOpeningBank(geometry.top, boundsCentre(geometry.bounds)),
        noteAngle: 0
      },
      ...route
    ]);
    this.nodes = cameraFlowNodes(protectedRoute.nodes, geometry.unit, (a, b) => this.blocked(a, b));
    this.detours = protectedRoute.detours;
  }

  private buildShortRoute(): Node[] {
    return performanceShortRoute(this.geometry, this.opening, this.duration);
  }

  /** The 132.5-second shot list, stretched from 22 s to the end of the song. */
  private buildLongRoute(): Node[] {
    const timeScale = (this.duration - FLIGHT_START) / 132.5;
    return this.buildRoute().map((node) => ({
      ...node,
      time: FLIGHT_START + node.time * timeScale,
      ...(node.velocity
        ? {
            velocity: point(
              node.velocity.x / timeScale,
              node.velocity.y / timeScale,
              node.velocity.z / timeScale
            )
          }
        : {})
    }));
  }

  private buildRoute(): Node[] {
    const g = this.geometry,
      box = g.bounds,
      body = g.avatar,
      key = g.keyboard,
      unit = g.unit;
    const {
      centre,
      actor,
      reach,
      hands,
      face,
      fit,
      wide,
      revealTarget,
      right,
      portrait,
      closeTop,
      lane,
      gapLane
    } = performanceRouteAnchors(g);
    const rear = point(centre.x, centre.y + fit * 0.18, centre.z + fit * 1.12);
    const left = point(box.min.x - 150 * unit, key.y + 260 * unit, key.z - 80 * unit);
    // The keyboard remains the stable visible composition anchor even during a rest.
    const roadTarget = point(lane?.x ?? key.x, key.y + 45 * unit, key.z);
    const node = (
      time: number,
      position: CameraPoint,
      target: CameraPoint,
      fov: number,
      shot: string,
      noteAngle = Math.PI / 2
    ): Node => ({ time, position, target, fov, shot, noteAngle });
    const sideWide = (sign: number, height = 0.2) =>
      point(centre.x + sign * fit * 1.12, centre.y + fit * height, key.z - 80 * unit);
    const nodes: Node[] = [
      node(0, wide, revealTarget, 48, "front-wide"),
      node(
        5,
        point(key.x + reach * 0.15, key.y + 420 * unit, key.z - 480 * unit),
        hands,
        34,
        "front-hands"
      ),
      node(7, right, hands, 34, "right-hands"),
      node(9, sideWide(1), centre, 56, "side-wide"),
      node(12, rear, centre, 56, "rear-wide"),
      node(
        13,
        point(rear.x - 100 * unit, rear.y + 35 * unit, rear.z - 20 * unit),
        centre,
        56,
        "rear-wide"
      ),
      node(16, sideWide(-1), centre, 56, "side-wide"),
      node(18, left, hands, 34, "left-hands")
    ];
    const travel = (
      anchor: CameraPoint | undefined,
      start: number,
      tilt: number,
      reverse: boolean
    ) => {
      const road = g.road;
      if (!anchor || !road) return;
      const roadNode = (time: number, fraction: number, shot: string): Node => ({
        time,
        position: performanceRoadPoint(anchor, road.height * fraction, tilt, 140 * unit),
        target: roadTarget,
        fov: reverse ? 54 : 58,
        shot,
        noteAngle: tilt,
        crossing: reverse ? "between" : "through"
      });
      nodes.push(
        roadNode(start, reverse ? 0.86 : 0.18, "road-entry"),
        roadNode(start + 4, reverse ? 0.78 : 0.28, "road-travel"),
        roadNode(start + 12, reverse ? 0.24 : 0.78, "road-travel"),
        roadNode(start + 16, reverse ? 0.16 : 0.85, "road-exit"),
        node(
          start + 20,
          point(centre.x, centre.y + fit * 0.2, centre.z - fit * 0.82),
          centre,
          50,
          "road-unhook",
          tilt
        )
      );
    };
    if (lane && g.road) {
      const heroLength = g.road.height * 2.5,
        angle = PERFORMANCE_ROAD_TILT;
      const roadPosition = (fraction: number, normal = 140) =>
        performanceRoadPoint(lane, heroLength * fraction, angle, normal * unit);
      const roadVelocity = (speed: number) =>
        point(0, Math.sin(angle) * speed * unit, -Math.cos(angle) * speed * unit);
      const hero = performanceHeroFlight(
        g.keyboardFlight,
        roadPosition(0.04),
        unit,
        g.obstacles,
        this.clearance
      );
      nodes.pop();
      if (hero)
        nodes.push(
          node(18, hero.approach, hands, 48, "hero-approach", angle),
          node(
            20,
            hero.entrance,
            hands,
            54,
            hero.underHands ? "hero-under-hands" : "hero-front-corridor",
            angle
          ),
          node(
            22,
            hero.under,
            hands,
            58,
            hero.underHands ? "hero-under-hands" : "hero-front-corridor",
            angle
          )
        );
      else nodes.push(node(18, left, hands, 34, "left-hands", angle));
      for (const [time, fraction, speed, normal, x, fov, bank] of [
        [24, 0.04, 250, 140, 0, 48, 0],
        [26.3, 0.22, 500, 220, -80, 58, -0.05],
        [28.7, 0.4, 500, 160, 80, 51, 0.05],
        [31, 0.56, 350, 100, 0, 43, -0.02]
      ] as const) {
        const position = roadPosition(fraction, normal);
        position.x += x * unit;
        nodes.push({
          ...node(
            time,
            position,
            performanceRoadFlightLook(position, roadVelocity(speed), angle, normal * unit, unit),
            fov,
            "hero-forward-travel",
            angle
          ),
          crossing: "through",
          forwardRoad: true,
          roadNormal: normal * unit,
          bank,
          roadScale: 2.5,
          velocity: roadVelocity(speed)
        });
      }
      const end = roadPosition(0.56),
        turn = point(end.x + 600 * unit, end.y + 200 * unit, end.z - 250 * unit);
      nodes.push(
        {
          ...node(
            33,
            turn,
            performanceRoadPoint(lane, heroLength * 0.65, angle),
            56,
            "hero-bank-turn",
            angle
          ),
          roadScale: 2.5,
          bank: -0.08,
          velocity: point(500 * unit, 0, 0)
        },
        {
          ...node(
            36,
            point(
              centre.x + fit * 0.4,
              lane.y + heroLength * 0.45 * Math.sin(angle) + 450 * unit,
              lane.z - heroLength * 0.45 * Math.cos(angle)
            ),
            performanceRoadPoint(lane, heroLength * 0.2, angle),
            48,
            "hero-unhook",
            angle
          ),
          roadScale: 2.5
        }
      );
      for (let index = 0; index < nodes.length; index++) {
        const n = nodes[index];
        if (n && n.time >= 18 && n.time <= 22) nodes[index] = { ...n, roadScale: 2.5 };
      }
    }
    const secondPortrait = point(
      actor.x - 220 * unit,
      face.y + 80 * unit,
      body.min.z - reach * 1.8
    );
    const keyboardWidth = Math.max(600 * unit, box.max.x - box.min.x);
    const topDistance =
      (keyboardWidth / (2 * Math.tan((45 * Math.PI) / 360) * Math.max(0.4, g.aspect ?? 1.5))) *
      1.15;
    const wholeTop = performanceTopPosition(
      point(lane?.x ?? key.x, key.y + Math.max(850 * unit, topDistance), key.z + 80 * unit),
      g,
      keyboardWidth
    );
    nodes.push(
      node(38, portrait, face, 32, "face"),
      node(
        42,
        point(portrait.x + 220 * unit, portrait.y, portrait.z - 100 * unit),
        face,
        35,
        "face-drift"
      ),
      node(
        46,
        point(centre.x + fit * 0.12, centre.y + fit * 0.18, centre.z - fit * 0.88),
        centre,
        50,
        "front-wide"
      ),
      node(
        50,
        point(key.x - 120 * unit, key.y + 350 * unit, key.z - 450 * unit),
        hands,
        38,
        "front-low-hands"
      ),
      node(56, right, hands, 40, "side-hands"),
      node(62, wholeTop, point(lane?.x ?? key.x, key.y, key.z), 45, "top-whole-keyboard"),
      node(
        66,
        point(wholeTop.x - 100 * unit, wholeTop.y + 50 * unit, wholeTop.z - 40 * unit),
        point(lane?.x ?? key.x, key.y, key.z),
        43,
        "top-whole-keyboard"
      ),
      node(68, closeTop, hands, 42, "top-hands"),
      node(
        72,
        point(closeTop.x - 100 * unit, closeTop.y + 60 * unit, closeTop.z - 40 * unit),
        hands,
        40,
        "top-hands"
      )
    );
    travel(gapLane, 78, 0.42, true);
    nodes.push(node(102, secondPortrait, face, 36, "face-three-quarter"));
    const flight = g.keyboardFlight;
    if (flight) {
      const approach = (p: CameraPoint, sign: number) =>
        point(p.x + sign * 160 * unit, p.y + 260 * unit, p.z);
      nodes.push(
        node(106, approach(flight.start, -1), hands, 48, "keyboard-approach"),
        node(
          108,
          flight.start,
          hands,
          58,
          flight.underHands ? "under-hands-traverse" : "keyboard-front-traverse"
        ),
        node(
          116,
          flight.end,
          hands,
          54,
          flight.underHands ? "under-hands-traverse" : "keyboard-front-traverse"
        ),
        node(118, approach(flight.end, 1), hands, 48, "keyboard-exit")
      );
    } else
      nodes.push(
        node(
          108,
          point(key.x - 100 * unit, key.y + 280 * unit, key.z - 600 * unit),
          hands,
          38,
          "front-low-hands"
        ),
        node(
          116,
          point(centre.x + fit * 0.8, centre.y + fit * 0.3, centre.z - fit * 0.8),
          centre,
          52,
          "right-wide"
        )
      );
    nodes.push(
      node(122, secondPortrait, face, 34, "portrait-return"),
      node(
        132.5,
        point(centre.x - fit * 0.405, centre.y + fit * 0.56, centre.z - fit * 1.215),
        centre,
        50,
        "final-wide"
      )
    );
    if (flight) {
      const velocity = point((flight.end.x - flight.start.x) / 8, 0, 0);
      for (let index = 0; index < nodes.length; index++) {
        const n = nodes[index];
        if (n && (n.time === 108 || n.time === 116)) nodes[index] = { ...n, velocity };
      }
    }
    return nodes;
  }

  private blocked(a: CameraPoint, b: CameraPoint): boolean {
    return this.geometry.obstacles.some((box) => segmentBlocked(a, b, box, this.clearance));
  }

  private protect(source: readonly Node[]): { nodes: readonly Node[]; detours: number } {
    const nodes = source.map((node) => ({ ...node, position: { ...node.position } }));
    const safeY =
      Math.max(this.geometry.bounds.max.y, ...this.geometry.obstacles.map((box) => box.max.y)) +
      Math.max(100 * this.geometry.unit, this.clearance * 3);
    for (const node of nodes)
      if (this.geometry.obstacles.some((box) => inside(node.position, box, this.clearance)))
        node.position.y = safeY;
    // If a vertical escape is blocked, move that named shot above the complete subject.
    let changed = true,
      remaining = nodes.length;
    while (changed && remaining-- > 0) {
      changed = false;
      for (let index = 1; index < nodes.length; index++) {
        const a = nodes[index - 1],
          b = nodes[index];
        if (!a || !b || !this.blocked(a.position, b.position)) continue;
        const highA = point(a.position.x, safeY, a.position.z),
          highB = point(b.position.x, safeY, b.position.z);
        if (this.blocked(a.position, highA)) {
          a.position.y = safeY;
          changed = true;
        }
        if (this.blocked(highB, b.position)) {
          b.position.y = safeY;
          changed = true;
        }
      }
    }
    const result: Node[] = [],
      first = nodes[0];
    if (first) result.push(first);
    let detours = 0;
    for (let index = 1; index < nodes.length; index++) {
      const a = nodes[index - 1],
        b = nodes[index];
      if (!a || !b) continue;
      if (this.blocked(a.position, b.position)) {
        const highA = point(a.position.x, safeY, a.position.z),
          highB = point(b.position.x, safeY, b.position.z);
        const legs = [
          distance(a.position, highA),
          distance(highA, highB),
          distance(highB, b.position)
        ];
        const total = Math.max(
          1,
          legs.reduce((sum, value) => sum + value, 0)
        );
        let elapsed = 0;
        for (const [leg, p] of [highA, highB].entries()) {
          elapsed += legs[leg] ?? 0;
          const ratio = elapsed / total;
          if (ratio <= 1e-6 || ratio >= 1 - 1e-6) continue;
          result.push({
            noteAngle: mix(a.noteAngle ?? Math.PI / 2, b.noteAngle ?? Math.PI / 2, ratio),
            roadScale: mix(a.roadScale ?? 1, b.roadScale ?? 1, ratio),
            time: mix(a.time, b.time, ratio),
            position: p,
            target: pointMix(a.target, b.target, ratio),
            fov: mix(a.fov, b.fov, ratio),
            shot: "clearance-rise"
          });
        }
        detours++;
      }
      result.push(b);
    }
    return { nodes: result, detours };
  }

  sample(songTime: number): PerformanceCameraPose {
    const time = Number.isFinite(songTime)
      ? Math.max(this.opening, Math.min(this.duration, songTime))
      : this.opening;
    const nodes = this.nodes;
    let right = nodes.findIndex((node) => node.time > time);
    if (right < 1) right = nodes.length - 1;
    const a = nodes[right - 1],
      b = nodes[right];
    if (!a || !b) throw new Error("Incomplete performance camera route");
    const seconds = Math.max(1e-6, b.time - a.time),
      u = Math.max(0, Math.min(1, (time - a.time) / seconds)),
      t = quintic(u);
    const position = cameraCurvePoint(a.position, b.position, u, seconds, a.velocity, b.velocity);
    let target = pointMix(a.target, b.target, t);
    const noteAngle = mix(a.noteAngle ?? Math.PI / 2, b.noteAngle ?? Math.PI / 2, t);
    if (a.forwardRoad && b.forwardRoad)
      target = performanceRoadFlightLook(
        position,
        cameraCurveVelocity(a.position, b.position, u, seconds, a.velocity, b.velocity),
        noteAngle,
        mix(a.roadNormal ?? 140 * this.geometry.unit, b.roadNormal ?? 140 * this.geometry.unit, t),
        this.geometry.unit
      );
    const orientation = cameraOrientation(position, target, a, b, t);
    return {
      position,
      target,
      ...orientation,
      noteAngle,
      roadScale: mix(a.roadScale ?? 1, b.roadScale ?? 1, t),
      fov: Math.max(28, Math.min(60, mix(a.fov, b.fov, t))),
      shot: t < 0.5 ? a.shot : b.shot,
      crossing: a.crossing ?? b.crossing
    };
  }
}
