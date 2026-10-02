import { Container, Sprite, Text, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";
import type { ScorePlacement } from "../song/scorePlacement";
import type { RoadProjection } from "./perspective";
import { RoadLaneLayer } from "./RoadLaneLayer";
import { createStaffRoadLayout } from "./staffRoadGeometry";
import type { StaffRoadLayout } from "./staffRoadGeometry";
import { staffRoadX } from "./staffRoadGeometry";
import { staffLineTargets } from "./staffLineTargets";
import type { KeyRect } from "./keyboardLayout";

/** Two five-line staves, upright clef labels and short ledger lines on the floor. */
export class StaffRoadLayer {
  readonly container = new Container({ eventMode: "none" });
  layout: StaffRoadLayout | undefined;
  private readonly lines = new RoadLaneLayer();
  private readonly clefs: Sprite[];
  private readonly textures: Texture[];
  private readonly ledgers: Sprite[] = [];
  private used = 0;
  private targets: readonly number[] = [];
  private readonly joins: Sprite[] = [];

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
      sprite.anchor.set(0.5, 1);
      sprite.alpha = 0.65;
      return sprite;
    });
    this.container.addChild(this.lines.container, ...this.clefs);
  }

  configure(placements: Iterable<ScorePlacement>, width: number): void {
    this.layout = createStaffRoadLayout(placements, width);
    this.lines.setEdges(this.layout.lines);
    for (const line of this.lines.container.children) line.alpha = 0.65;
  }

  setKeys(keys: ReadonlyMap<number, KeyRect>): void {
    this.targets = staffLineTargets(keys);
  }

  draw(projection: RoadProjection, pan = 0): void {
    const layout = this.layout;
    if (!layout) return;
    this.lines.draw(projection, 0, projection.depthAt(0.78));
    let used = 0;
    for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex++) {
      const staffX = layout.lines[lineIndex];
      const target = this.targets[lineIndex];
      if (staffX === undefined || target === undefined) continue;
      for (let segment = 0; segment < 16; segment++) {
        const progress = 0.78 + (0.22 * segment) / 16;
        const next = 0.78 + (0.22 * (segment + 1)) / 16;
        const top = projection.at(
          staffRoadX(staffX, target - pan, progress),
          projection.depthAt(progress)
        );
        const bottom = projection.at(
          staffRoadX(staffX, target - pan, next),
          projection.depthAt(next)
        );
        let line = this.joins[used];
        if (!line) {
          line = new Sprite(Texture.WHITE);
          line.anchor.set(0.5, 0);
          line.tint = 0x2f7bff;
          line.alpha = 0.65;
          this.joins.push(line);
          this.container.addChild(line);
        }
        const dx = bottom.x - top.x;
        const dy = bottom.y - top.y;
        line.position.set(top.x, top.y);
        line.rotation = Math.atan2(dy, dx) - Math.PI / 2;
        line.width = 1;
        line.height = Math.hypot(dx, dy);
        line.visible = true;
        used++;
      }
    }
    for (let index = used; index < this.joins.length; index++) {
      const line = this.joins[index];
      if (line) line.visible = false;
    }
    ["bass", "treble"].forEach((clef, index) => {
      const sprite = this.clefs[index];
      if (!sprite) return;
      const spot = projection.at(
        layout.center(clef as "bass" | "treble"),
        projection.depthAt(0.76)
      );
      sprite.position.set(spot.x, spot.y - 4);
      sprite.scale.set(Math.min(0.7, layout.step / 32));
    });
  }

  begin(): void {
    this.used = 0;
  }

  ledger(placement: ScorePlacement, depth: number, projection: RoadProjection): void {
    const layout = this.layout;
    const endDepth = projection.depthAt(0.78);
    if (!layout || depth <= 0 || depth > endDepth) return;
    const low = Math.min(-2, Math.ceil(placement.position / 2) * 2);
    const high = Math.max(10, Math.floor(placement.position / 2) * 2);
    const start = placement.position < 0 ? low : 10;
    const end = placement.position < 0 ? -2 : high;
    if (placement.position > -2 && placement.position < 10) return;
    for (let position = start; position <= end; position += 2) {
      let line = this.ledgers[this.used];
      if (!line) {
        line = new Sprite(Texture.WHITE);
        line.anchor.set(0.5, 0);
        line.tint = 0x7dc8f0;
        this.ledgers.push(line);
        this.container.addChild(line);
      }
      const x = layout.x(placement) + (position - placement.position) * layout.step;
      const top = projection.at(x, Math.max(0, depth - 0.025));
      const bottom = projection.at(x, Math.min(endDepth, depth + 0.025));
      const dx = bottom.x - top.x;
      const dy = bottom.y - top.y;
      line.position.set(top.x, top.y);
      line.rotation = Math.atan2(dy, dx) - Math.PI / 2;
      line.width = 1;
      line.height = Math.hypot(dx, dy);
      line.alpha = 0.7;
      line.visible = true;
      this.used++;
    }
  }

  end(): void {
    for (let index = this.used; index < this.ledgers.length; index++) {
      const line = this.ledgers[index];
      if (line) line.visible = false;
    }
  }

  destroy(): void {
    for (const texture of this.textures) texture.destroy(true);
  }
}
