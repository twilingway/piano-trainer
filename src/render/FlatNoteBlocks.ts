import { Container, NineSliceSprite, Texture } from "pixi.js";

/** Arcadia's card tube is stretched by its middle, preserving the rounded ends. */
export class FlatNoteBlocks {
  readonly container = new Container();
  private readonly fill: Texture;
  private readonly pool: { fill: NineSliceSprite; neon: NineSliceSprite }[] = [];
  private used = 0;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 84;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 64, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.3, "rgba(255,255,255,0.55)");
      gradient.addColorStop(0.7, "rgba(255,255,255,0.75)");
      gradient.addColorStop(1, "rgba(255,255,255,1)");
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(2, 2, 60, 80, 8);
      context.fill();
      context.strokeStyle = "white";
      context.lineWidth = 2;
      context.stroke();
    }
    this.fill = Texture.from(canvas);
    this.container.eventMode = "none";
  }

  begin(): void {
    this.used = 0;
  }

  draw(
    x: number,
    top: number,
    width: number,
    height: number,
    tint: number,
    alpha: number,
    neon: Texture
  ): void {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return;
    let item = this.pool[this.used++];
    if (!item) {
      const fill = new NineSliceSprite({
        texture: this.fill,
        leftWidth: 12,
        rightWidth: 12,
        topHeight: 12,
        bottomHeight: 12
      });
      const glow = new NineSliceSprite({
        texture: neon,
        leftWidth: 34,
        rightWidth: 34,
        topHeight: 34,
        bottomHeight: 34
      });
      glow.blendMode = "add";
      item = { fill, neon: glow };
      this.pool.push(item);
      this.container.addChild(fill, glow);
    }
    // Scale the corners with key width; short notes reduce them rather than overlap caps.
    const scale = Math.min(1, width / 64, height / 24);
    const margin = 22 * scale;
    item.fill.visible = item.neon.visible = true;
    item.fill.tint = item.neon.tint = tint;
    item.fill.alpha = item.neon.alpha = alpha;
    item.fill.scale.set(scale);
    item.neon.scale.set(scale);
    item.fill.position.set(x - width / 2, top);
    item.fill.setSize(width / scale, height / scale);
    item.neon.texture = neon;
    item.neon.position.set(x - width / 2 - margin, top - margin);
    item.neon.setSize(width / scale + 44, height / scale + 44);
  }

  end(): void {
    for (let index = this.used; index < this.pool.length; index++) {
      const item = this.pool[index];
      if (item) item.fill.visible = item.neon.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.fill.destroy(true);
  }
}
