import { Container, Sprite, Texture } from "pixi.js";
import type { RoadProjection } from "./perspective";

/** Direct screen-space edges avoid the affine UV bends of a textured perspective mesh. */
export class RoadLaneLayer {
  readonly container = new Container({ eventMode: "none" });
  private edges: readonly number[] = [];

  setEdges(edges: readonly number[]): void {
    this.edges = edges;
    this.container.removeChildren().forEach((child) => {
      child.destroy();
    });
    edges.forEach(() => {
      const line = new Sprite(Texture.WHITE);
      line.anchor.set(0.5, 0);
      line.tint = 0x2f7bff;
      line.alpha = 0.35;
      this.container.addChild(line);
    });
  }

  draw(projection: RoadProjection, pan: number, endDepth = 1): void {
    this.edges.forEach((edge, index) => {
      const line = this.container.children[index];
      if (!line) return;
      const top = projection.at(edge - pan, 0);
      const bottom = projection.at(edge - pan, endDepth);
      const dx = bottom.x - top.x;
      const dy = bottom.y - top.y;
      line.position.set(top.x, top.y);
      line.rotation = Math.atan2(dy, dx) - Math.PI / 2;
      line.width = 1;
      line.height = Math.hypot(dx, dy);
    });
  }
}
