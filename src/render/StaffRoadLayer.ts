import { Container } from "pixi.js";
import type { RoadProjection } from "./perspective";
import { RoadLaneLayer } from "./RoadLaneLayer";
import { staffLineTargets, extendedStaffTargets } from "./staffLineTargets";
import type { KeyRect } from "./keyboardLayout";

/** Straight staff lines extended to the piano. */
export class StaffRoadLayer {
  readonly container = new Container({ eventMode: "none" });
  private readonly lines = new RoadLaneLayer();
  private targets: readonly number[] = [];

  constructor() {
    this.container.addChild(this.lines.container);
  }

  setKeys(keys: ReadonlyMap<number, KeyRect>): void {
    this.targets = staffLineTargets(keys);
    const edges = extendedStaffTargets(keys);
    this.lines.setEdges(edges);
    edges.forEach((edge, index) => {
      const line = this.lines.container.children[index];
      if (!line) return;
      line.alpha = this.targets.some((target) => Math.abs(target - edge) < 0.01) ? 0.65 : 0.28;
    });
  }

  draw(projection: RoadProjection, pan = 0): void {
    this.lines.draw(projection, pan);
  }
}
