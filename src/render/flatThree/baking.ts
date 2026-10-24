import { Rectangle, type PointData } from "./math";
import { Sprite } from "./meshes";
import type { DestroyOptions } from "./scene";
import { Texture, TextureSource } from "./textures";

export class FillGradient {
  readonly start: PointData;
  readonly end: PointData;
  readonly colorStops: readonly { offset: number; color: number | string }[];
  constructor(options: {
    type?: string;
    start: PointData;
    end: PointData;
    colorStops: readonly { offset: number; color: number | string }[];
    textureSpace?: string;
  }) {
    this.start = { ...options.start };
    this.end = { ...options.end };
    this.colorStops = options.colorStops.map((stop) => ({ ...stop }));
  }
  destroy(): void {
    /* Canvas gradients have no retained GPU resource. */
  }
}
type Color = number | string;
type Paint =
  Color | FillGradient | { color?: Color; alpha?: number; width?: number; join?: CanvasLineJoin };
type Draw = (context: CanvasRenderingContext2D) => void;
function color(value: Color = 0xffffff): string {
  return typeof value === "string" ? value : "#" + value.toString(16).padStart(6, "0");
}
function paint(
  context: CanvasRenderingContext2D,
  value: Paint,
  bounds: Rectangle
): string | CanvasGradient {
  if (value instanceof FillGradient) {
    const gradient = context.createLinearGradient(
      bounds.x + bounds.width * value.start.x,
      bounds.y + bounds.height * value.start.y,
      bounds.x + bounds.width * value.end.x,
      bounds.y + bounds.height * value.end.y
    );
    for (const stop of value.colorStops) gradient.addColorStop(stop.offset, color(stop.color));
    return gradient;
  }
  return color(typeof value === "object" ? value.color : value);
}
function canvasFor(
  bounds: Rectangle,
  resolution: number
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bounds.width * resolution));
  canvas.height = Math.max(1, Math.ceil(bounds.height * resolution));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas2D is unavailable");
  context.scale(resolution, resolution);
  context.translate(-bounds.x, -bounds.y);
  return { canvas, context };
}
function textureFrom(canvas: HTMLCanvasElement, bounds: Rectangle, resolution: number): Texture {
  return new Texture({
    source: new TextureSource(
      canvas,
      Math.max(bounds.width, 1 / resolution),
      Math.max(bounds.height, 1 / resolution),
      resolution
    )
  });
}

/** Shapes are rasterized only after an edit, then rendered as ordinary Three.js quads. */
export class Graphics extends Sprite {
  private paths: Draw[] = [];
  private operations: Draw[] = [];
  private painted = false;
  private dirty = true;
  private left = Infinity;
  private top = Infinity;
  private right = -Infinity;
  private bottom = -Infinity;
  private strokePadding = 0;
  constructor() {
    super(Texture.EMPTY);
  }
  private point(x: number, y: number): void {
    this.left = Math.min(this.left, x);
    this.right = Math.max(this.right, x);
    this.top = Math.min(this.top, y);
    this.bottom = Math.max(this.bottom, y);
    this.dirty = true;
  }
  private shape(draw: Draw): void {
    if (this.painted) {
      this.paths = [];
      this.painted = false;
    }
    this.paths.push(draw);
    this.dirty = true;
  }
  rect(x: number, y: number, width: number, height: number): this {
    this.shape((ctx) => {
      ctx.rect(x, y, width, height);
    });
    this.point(x, y);
    this.point(x + width, y + height);
    return this;
  }
  roundRect(x: number, y: number, width: number, height: number, radius: number): this {
    this.shape((ctx) => {
      ctx.roundRect(x, y, width, height, radius);
    });
    this.point(x, y);
    this.point(x + width, y + height);
    return this;
  }
  circle(x: number, y: number, radius: number): this {
    return this.ellipse(x, y, radius, radius);
  }
  ellipse(x: number, y: number, radiusX: number, radiusY: number): this {
    this.shape((ctx) => {
      ctx.moveTo(x + radiusX, y);
      ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    });
    this.point(x - radiusX, y - radiusY);
    this.point(x + radiusX, y + radiusY);
    return this;
  }
  moveTo(x: number, y: number): this {
    this.shape((ctx) => {
      ctx.moveTo(x, y);
    });
    this.point(x, y);
    return this;
  }
  lineTo(x: number, y: number): this {
    this.shape((ctx) => {
      ctx.lineTo(x, y);
    });
    this.point(x, y);
    return this;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): this {
    this.shape((ctx) => {
      ctx.quadraticCurveTo(cx, cy, x, y);
    });
    this.point(cx, cy);
    this.point(x, y);
    return this;
  }
  closePath(): this {
    this.shape((ctx) => {
      ctx.closePath();
    });
    return this;
  }
  private commit(value: Paint, stroke: boolean): this {
    const paths = [...this.paths];
    const settings = typeof value === "object" && !(value instanceof FillGradient) ? value : {};
    if (stroke) this.strokePadding = Math.max(this.strokePadding, (settings.width ?? 1) / 2);
    const bounds = this.getLocalBounds();
    this.operations.push((ctx) => {
      ctx.save();
      ctx.beginPath();
      for (const path of paths) path(ctx);
      ctx.globalAlpha = settings.alpha ?? 1;
      if (stroke) {
        ctx.strokeStyle = paint(ctx, value, bounds);
        ctx.lineWidth = settings.width ?? 1;
        ctx.lineJoin = settings.join ?? "miter";
        ctx.stroke();
      } else {
        ctx.fillStyle = paint(ctx, value, bounds);
        ctx.fill();
      }
      ctx.restore();
    });
    this.painted = true;
    this.dirty = true;
    return this;
  }
  fill(value: Paint = 0xffffff): this {
    return this.commit(value, false);
  }
  stroke(value: Paint = 0xffffff): this {
    return this.commit(value, true);
  }
  clear(): this {
    this.paths = [];
    this.operations = [];
    this.left = this.top = Infinity;
    this.right = this.bottom = -Infinity;
    this.strokePadding = 0;
    this.dirty = true;
    return this;
  }
  clone(): Graphics {
    const result = new Graphics();
    result.paths = [...this.paths];
    result.operations = [...this.operations];
    result.painted = this.painted;
    result.left = this.left;
    result.top = this.top;
    result.right = this.right;
    result.bottom = this.bottom;
    result.strokePadding = this.strokePadding;
    return result;
  }
  override getLocalBounds(): Rectangle {
    const p = this.strokePadding;
    return Number.isFinite(this.left)
      ? new Rectangle(
          this.left - p,
          this.top - p,
          this.right - this.left + p * 2,
          this.bottom - this.top + p * 2
        )
      : new Rectangle();
  }
  drawCanvas(context: CanvasRenderingContext2D): void {
    for (const operation of this.operations) operation(context);
  }
  ensureBaked(): void {
    if (!this.dirty) return;
    const bounds = this.getLocalBounds(),
      resolution = 2;
    const { canvas, context } = canvasFor(bounds, resolution);
    this.drawCanvas(context);
    if (this.texture !== Texture.EMPTY) this.texture.destroy(true);
    this.texture = textureFrom(canvas, bounds, resolution);
    this.offset.set(bounds.x, bounds.y);
    this.dirty = false;
  }
  override destroy(options: DestroyOptions | boolean = {}): void {
    this.texture.destroy(true);
    super.destroy(options);
  }
}

export interface TextStyleOptions {
  fontFamily?: string | string[];
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  fill?: Color | FillGradient;
  stroke?: { color?: Color; width?: number };
  dropShadow?: { color?: Color; blur?: number; distance?: number; alpha?: number; angle?: number };
  padding?: number;
  align?: CanvasTextAlign;
  letterSpacing?: number;
  lineHeight?: number;
}
export class Text extends Sprite {
  readonly style: TextStyleOptions & { update(): void };
  private value: string;
  private dirty = true;
  private measured: ReturnType<Text["measure"]> | undefined;
  readonly resolution: number;
  constructor(options: { text: string | number; style?: TextStyleOptions; resolution?: number }) {
    super(Texture.EMPTY);
    this.value = String(options.text);
    this.resolution = options.resolution ?? 2;
    this.style = {
      ...options.style,
      update: () => {
        this.measured = undefined;
        this.dirty = true;
      }
    };
  }
  get text(): string {
    return this.value;
  }
  set text(value: string | number) {
    if (String(value) !== this.value) {
      this.measured = undefined;
      this.value = String(value);
      this.dirty = true;
    }
  }
  override get width(): number {
    return this.measure().bounds.width * Math.abs(this.scale.x);
  }
  override set width(value: number) {
    const width = this.measure().bounds.width;
    this.scale.x = width ? value / width : 1;
  }
  override get height(): number {
    return this.measure().bounds.height * Math.abs(this.scale.y);
  }
  override set height(value: number) {
    const height = this.measure().bounds.height;
    this.scale.y = height ? value / height : 1;
  }
  private font(): string {
    const family = this.style.fontFamily ?? "sans-serif";
    return `${this.style.fontStyle ?? "normal"} ${String(this.style.fontWeight ?? "normal")} ${String(this.style.fontSize ?? 26)}px ${Array.isArray(family) ? family.join(",") : family}`;
  }
  private measure(): {
    bounds: Rectangle;
    padding: number;
    lines: string[];
    lineHeight: number;
    ascent: number;
  } {
    if (this.measured) return this.measured;
    const size = this.style.fontSize ?? 26;
    const padding = (this.style.padding ?? 0) + (this.style.stroke?.width ?? 0) / 2;
    const shadowDistance = this.style.dropShadow?.distance ?? 0;
    const lines = this.value.split("\n");
    let width = Math.max(0, ...lines.map((line) => line.length * size * 0.65));
    let ascent = size * 0.8,
      descent = size * 0.2;
    if (typeof document !== "undefined") {
      const context = document.createElement("canvas").getContext("2d");
      if (context) {
        context.font = this.font();
        const probe = context.measureText("ÉqÅM|");
        if (
          Number.isFinite(probe.actualBoundingBoxAscent) &&
          Number.isFinite(probe.actualBoundingBoxDescent) &&
          probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent > 0
        ) {
          ascent = probe.actualBoundingBoxAscent;
          descent = probe.actualBoundingBoxDescent;
        }
        width = Math.max(
          0,
          ...lines.map((line) => {
            const metrics = context.measureText(line);
            return (
              Math.max(
                metrics.width,
                (Number.isFinite(metrics.actualBoundingBoxLeft)
                  ? metrics.actualBoundingBoxLeft
                  : 0) +
                  (Number.isFinite(metrics.actualBoundingBoxRight)
                    ? metrics.actualBoundingBoxRight
                    : 0)
              ) +
              Math.max(0, line.length - 1) * (this.style.letterSpacing ?? 0)
            );
          })
        );
      }
    }
    const fontHeight = ascent + descent,
      lineHeight = this.style.lineHeight ?? fontHeight;
    return (this.measured = {
      bounds: new Rectangle(
        0,
        0,
        width + padding * 2 + shadowDistance,
        Math.max(fontHeight, lineHeight) +
          (lines.length - 1) * lineHeight +
          padding * 2 +
          shadowDistance
      ),
      padding,
      lines,
      lineHeight,
      ascent
    });
  }

  override getLocalBounds(): Rectangle {
    const { bounds } = this.measure();
    return new Rectangle(
      -this.anchor.x * bounds.width,
      -this.anchor.y * bounds.height,
      bounds.width,
      bounds.height
    );
  }
  ensureBaked(): void {
    if (!this.dirty) return;
    const { bounds, padding, lines, lineHeight, ascent } = this.measure(),
      { canvas, context } = canvasFor(bounds, this.resolution);
    context.font = this.font();
    context.textBaseline = "alphabetic";
    context.textAlign = this.style.align ?? "left";
    const shadow = this.style.dropShadow;
    if (shadow) {
      const shade = color(shadow.color);
      context.shadowColor =
        shade.startsWith("#") && shade.length === 7
          ? shade +
            Math.round((shadow.alpha ?? 1) * 255)
              .toString(16)
              .padStart(2, "0")
          : shade;
      context.shadowBlur = shadow.blur ?? 0;
      context.shadowOffsetX = Math.cos(shadow.angle ?? Math.PI / 4) * (shadow.distance ?? 0);
      context.shadowOffsetY = Math.sin(shadow.angle ?? Math.PI / 4) * (shadow.distance ?? 0);
    }
    const x =
      this.style.align === "center"
        ? bounds.width / 2
        : this.style.align === "right"
          ? bounds.width - padding
          : padding;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "",
        y = padding + ascent + i * lineHeight;
      if (this.style.stroke) {
        context.strokeStyle = color(this.style.stroke.color);
        context.lineWidth = this.style.stroke.width ?? 1;
        context.lineJoin = "round";
        context.strokeText(text, x, y);
      }
      context.fillStyle = paint(
        context,
        this.style.fill ?? 0xffffff,
        new Rectangle(padding, padding, bounds.width - padding * 2, bounds.height - padding * 2)
      );
      context.fillText(text, x, y);
    }
    if (this.texture !== Texture.EMPTY) this.texture.destroy(true);
    this.texture = textureFrom(canvas, bounds, this.resolution);
    this.dirty = false;
  }
  override destroy(options: DestroyOptions | boolean = {}): void {
    this.texture.destroy(true);
    super.destroy(options);
  }
}
