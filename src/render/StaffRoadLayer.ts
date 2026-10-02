import { Container, Sprite, Text } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";
import type { RoadProjection } from "./perspective";
import { RoadLaneLayer } from "./RoadLaneLayer";
import { staffLineTargets, extendedStaffTargets } from "./staffLineTargets";
import type { KeyRect } from "./keyboardLayout";

/** Straight staff lines extended to the piano, with clefs beside their own staves. */
export class StaffRoadLayer {
  readonly container = new Container({ eventMode: "none" });
  private readonly lines = new RoadLaneLayer();
  private readonly clefs: Sprite[];
  private readonly textures: Texture[];
  private targets: readonly number[] = [];
  private whiteWidth = 0;

  constructor(renderer: Renderer) {
    this.textures = ["\u{1D122}", "\u{1D11E}"].map((text) => {
      const label = new Text({
        text,
        style: {
          fontFamily: '"Segoe UI Symbol", "Noto Music", "Apple Symbols", serif',
          fontSize: 64,
          fill: 0xcef5ff
        }
      });
      const texture = renderer.generateTexture({ target: label, resolution: 2 });
      label.destroy();
      return texture;
    });
    this.clefs = this.textures.map((texture) => {
      const sprite = new Sprite(texture);
      sprite.anchor.set(1, 1);
      sprite.alpha = 0.65;
      return sprite;
    });
    this.container.addChild(this.lines.container, ...this.clefs);
  }

  setKeys(keys: ReadonlyMap<number, KeyRect>): void {
    this.targets = staffLineTargets(keys);
    this.whiteWidth = [...keys.values()].find((key) => !key.black)?.width ?? 0;
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
    this.clefs.forEach((sprite, index) => {
      const start = this.targets[index * 5];
      sprite.visible = start !== undefined;
      if (start === undefined) return;
      const spot = projection.at(start - this.whiteWidth * 0.75 - pan, projection.depthAt(0.76));
      sprite.position.set(spot.x, spot.y - 4);
      sprite.scale.set(Math.min(0.7, this.whiteWidth / 64));
    });
  }

  destroy(): void {
    for (const texture of this.textures) texture.destroy(true);
  }
}
