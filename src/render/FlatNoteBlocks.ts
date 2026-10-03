import { Container, NineSliceSprite, Texture } from "pixi.js";

/** Arcadia's card tube is stretched by its middle, preserving the rounded ends. */
export class FlatNoteBlocks {
  readonly container = new Container();
  private readonly fill: Texture;
  private readonly rim: Texture;
  private readonly halo: Texture;
  private readonly pool: { fill: NineSliceSprite; neon: NineSliceSprite; rim: NineSliceSprite }[] =
    [];
  private used = 0;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 84;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 64, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(0.14, "rgba(255,255,255,0.6)");
      gradient.addColorStop(0.3, "rgba(255,255,255,0.22)");
      gradient.addColorStop(0.7, "rgba(255,255,255,0.36)");
      gradient.addColorStop(0.86, "rgba(255,255,255,0.68)");
      gradient.addColorStop(1, "rgba(255,255,255,0.95)");
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(2, 2, 60, 80, 8);
      context.fill();
      // Baked bevels and a narrow reflection leave the middle transparent.
      context.save();
      context.clip();
      context.fillStyle = "rgba(255,255,255,0.16)";
      context.beginPath();
      context.moveTo(7, 5);
      context.lineTo(24, 5);
      context.lineTo(17, 78);
      context.lineTo(12, 78);
      context.closePath();
      context.fill();
      const foot = context.createLinearGradient(0, 64, 0, 82);
      foot.addColorStop(0, "rgba(255,255,255,0)");
      foot.addColorStop(1, "rgba(255,255,255,0.75)");
      context.fillStyle = foot;
      context.fillRect(2, 64, 60, 18);
      context.restore();
    }
    this.fill = Texture.from(canvas);
    const rimCanvas = document.createElement("canvas");
    rimCanvas.width = 64;
    rimCanvas.height = 84;
    const rimContext = rimCanvas.getContext("2d");
    if (rimContext) {
      rimContext.strokeStyle = "white";
      rimContext.lineWidth = 2.4;
      rimContext.beginPath();
      rimContext.roundRect(2, 2, 60, 80, 8);
      rimContext.stroke();
    }
    this.rim = Texture.from(rimCanvas);
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = 108;
    haloCanvas.height = 128;
    const haloContext = haloCanvas.getContext("2d");
    if (haloContext) {
      haloContext.strokeStyle = haloContext.shadowColor = "white";
      for (const [blur, opacity] of [
        [18, 0.45],
        [9, 0.65],
        [3, 0.9]
      ] as const) {
        haloContext.shadowBlur = blur;
        haloContext.globalAlpha = opacity;
        haloContext.lineWidth = 2;
        haloContext.beginPath();
        haloContext.roundRect(24, 24, 60, 80, 8);
        haloContext.stroke();
      }
      // Only the outline emits light; the interior keeps its transparency and hue.
      haloContext.globalAlpha = 1;
      haloContext.shadowBlur = 0;
      haloContext.globalCompositeOperation = "destination-out";
      haloContext.beginPath();
      haloContext.roundRect(26, 26, 56, 76, 6);
      haloContext.fill();
    }
    this.halo = Texture.from(haloCanvas);
    this.container.eventMode = "none";
  }

  begin(): void {
    this.used = 0;
  }

  draw(x: number, top: number, width: number, height: number, tint: number, alpha: number): void {
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
        texture: this.halo,
        leftWidth: 34,
        rightWidth: 34,
        topHeight: 34,
        bottomHeight: 34
      });
      glow.blendMode = "add";
      const rim = new NineSliceSprite({
        texture: this.rim,
        leftWidth: 12,
        rightWidth: 12,
        topHeight: 12,
        bottomHeight: 12
      });
      rim.blendMode = "add";
      item = { fill, neon: glow, rim };
      this.pool.push(item);
      this.container.addChild(fill, glow, rim);
    }
    // Scale the corners with key width; short notes reduce them rather than overlap caps.
    const scale = Math.min(1, width / 64, height / 24);
    const margin = 22 * scale;
    item.fill.visible = item.neon.visible = true;
    item.rim.visible = true;
    item.fill.tint = item.neon.tint = tint;
    item.fill.alpha = alpha;
    item.neon.alpha = alpha;
    item.rim.tint = 0xf0fbff;
    item.rim.alpha = alpha;
    item.fill.scale.set(scale);
    item.neon.scale.set(scale);
    item.rim.scale.set(scale);
    item.fill.position.set(x - width / 2, top);
    item.fill.setSize(width / scale, height / scale);
    item.rim.position.copyFrom(item.fill.position);
    item.rim.setSize(width / scale, height / scale);
    item.neon.position.set(x - width / 2 - margin, top - margin);
    item.neon.setSize(width / scale + 44, height / scale + 44);
  }

  end(): void {
    for (let index = this.used; index < this.pool.length; index++) {
      const item = this.pool[index];
      if (item) item.fill.visible = item.neon.visible = item.rim.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.fill.destroy(true);
    this.rim.destroy(true);
    this.halo.destroy(true);
  }
}
