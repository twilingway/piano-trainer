import { Container, NineSliceSprite, Texture } from "pixi.js";
import {
  bakeNoteMaterial,
  NOTE_BLOOM_MARGIN,
  NOTE_FACE_HEIGHT,
  NOTE_FACE_WIDTH
} from "./bakeNoteMaterial";

/** The lane's backdrop: a raised note's plate cuts it out of the notes below. */
const PLATE_COLOR = 0x020c18;
/** Layers of a raised (black-key) note sit above every layer of a flat one. */
const RAISED_Z = 4;
/** The dark gap a raised note's plate leaves around its glass, in pixels. */
const PLATE_RIM_PX = 2;

interface NoteBlock {
  fill: NineSliceSprite;
  emission: NineSliceSprite;
  bloom: NineSliceSprite;
  bevel: NineSliceSprite;
  plate: NineSliceSprite;
}

/**
 * Glass colour, luminous core and bloom are independent baked layers. A black
 * key's note overhangs its white neighbours, so it is raised above them on an
 * opaque plate instead of mixing its translucent glass with theirs.
 */
export class FlatNoteBlocks {
  readonly container = new Container({ sortableChildren: true });
  private readonly textures: Record<keyof NoteBlock, Texture>;
  private readonly pool: NoteBlock[] = [];
  private used = 0;

  constructor() {
    const material = bakeNoteMaterial((width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    });
    this.textures = {
      fill: Texture.from(material.face),
      emission: Texture.from(material.emission),
      bloom: Texture.from(material.bloom),
      bevel: Texture.from(material.bevel),
      plate: Texture.from(bakePlate())
    };
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
    raised = false
  ): void {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return;
    let item = this.pool[this.used++];
    if (!item) {
      const layer = (texture: Texture, zIndex: number, margin = 0) => {
        const sprite = new NineSliceSprite({
          texture,
          leftWidth: 12 + margin,
          rightWidth: 12 + margin,
          topHeight: 12 + margin,
          bottomHeight: 12 + margin
        });
        sprite.zIndex = zIndex;
        if (zIndex !== 1) sprite.blendMode = "add";
        return sprite;
      };
      item = {
        fill: layer(this.textures.fill, 1),
        emission: layer(this.textures.emission, 2),
        bloom: layer(this.textures.bloom, 0, NOTE_BLOOM_MARGIN),
        bevel: layer(this.textures.bevel, 3),
        plate: layer(this.textures.plate, 0)
      };
      item.plate.blendMode = "normal";
      this.pool.push(item);
      // Every halo stays below every face, including neighbouring and repeated notes.
      this.container.addChild(item.fill, item.emission, item.bloom, item.bevel, item.plate);
    }
    const lift = raised ? RAISED_Z : 0;
    item.fill.zIndex = 1 + lift;
    item.emission.zIndex = 2 + lift;
    item.bevel.zIndex = 3 + lift;
    item.plate.zIndex = lift;
    item.plate.visible = raised;
    const scale = Math.min(1, width / 64, height / 24);
    // Reuse each layer without allocations in the animation loop.
    this.placeFace(item.fill, x, top, width, height, scale, tint, alpha);
    this.placeFace(item.emission, x, top, width, height, scale, tint, alpha);
    this.placeFace(item.bevel, x, top, width, height, scale, 0xffffff, alpha);
    if (raised) {
      const rim = PLATE_RIM_PX * 2;
      this.placeFace(
        item.plate,
        x,
        top - PLATE_RIM_PX,
        width + rim,
        height + rim,
        scale,
        PLATE_COLOR,
        1
      );
    }
    // A short note still emits a halo of the same radius as its key's other notes.
    const bloomScale = Math.min(1, width / 64);
    const margin = NOTE_BLOOM_MARGIN * bloomScale;
    item.bloom.visible = true;
    item.bloom.tint = tint;
    item.bloom.alpha = alpha;
    item.bloom.scale.set(bloomScale);
    item.bloom.position.set(x - width / 2 - margin, top - margin);
    item.bloom.setSize(
      width / bloomScale + NOTE_BLOOM_MARGIN * 2,
      height / bloomScale + NOTE_BLOOM_MARGIN * 2
    );
  }

  end(): void {
    for (let index = this.used; index < this.pool.length; index++) {
      const item = this.pool[index];
      if (item)
        item.fill.visible =
          item.emission.visible =
          item.bloom.visible =
          item.bevel.visible =
          item.plate.visible =
            false;
    }
  }

  private placeFace(
    sprite: NineSliceSprite,
    x: number,
    top: number,
    width: number,
    height: number,
    scale: number,
    tint: number,
    alpha: number
  ): void {
    sprite.visible = true;
    sprite.tint = tint;
    sprite.alpha = alpha;
    sprite.scale.set(scale);
    sprite.position.set(x - width / 2, top);
    sprite.setSize(width / scale, height / scale);
  }

  destroy(): void {
    this.container.destroy({ children: true });
    for (const texture of Object.values(this.textures)) texture.destroy(true);
  }
}

function bakePlate(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = NOTE_FACE_WIDTH;
  canvas.height = NOTE_FACE_HEIGHT;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#fff";
    context.beginPath();
    context.roundRect(0, 0, NOTE_FACE_WIDTH, NOTE_FACE_HEIGHT, 10);
    context.fill();
  }
  return canvas;
}
