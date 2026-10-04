import { Container, PerspectiveMesh, Rectangle, Texture } from "pixi.js";
import type { KeyRect } from "./keyboardLayout";
import type { Geometry } from "./viewGeometry";
import { quadPoint } from "./perspective";
import type { Projected } from "./perspective";
import { insidePolygon, keySurface } from "./worldCamera";
import type { WorldCamera } from "./worldCamera";

interface Face {
  readonly key: KeyRect;
  readonly top: PerspectiveMesh;
  readonly front: PerspectiveMesh;
  readonly side: PerspectiveMesh;
  polygon: readonly Projected[];
  /** The top face's corners on screen and the part of the flat keys it shows. */
  topCorners?: readonly [Projected, Projected, Projected, Projected];
  readonly source: { readonly y: number; readonly height: number };
}
/** Physical piano faces, with the existing baked colours, digits and stickers as their material. */
export class PerspectiveKeyboardLayer {
  readonly container = new Container({ eventMode: "none" });
  private faces: Face[] = [];
  private texture: Texture | undefined;
  private geometry: Geometry | undefined;
  private readonly frontTexture = bakeFront();

  layout(keys: ReadonlyMap<number, KeyRect>, geometry: Geometry, texture: Texture): void {
    this.destroyFaces();
    this.texture = texture;
    this.geometry = geometry;
    for (const black of [false, true]) {
      for (const key of keys.values()) {
        if (key.black !== black) continue;
        const sourceY = black ? 0 : geometry.blackHeight;
        const sourceHeight = black ? geometry.blackHeight : geometry.keyboardHeight - sourceY;
        const topTexture = new Texture({
          source: texture.source,
          frame: new Rectangle(key.x, sourceY, key.width, Math.max(1, sourceHeight))
        });
        const top = new PerspectiveMesh({ texture: topTexture, verticesX: 2, verticesY: 2 });
        const front = new PerspectiveMesh({
          texture: this.frontTexture,
          verticesX: 2,
          verticesY: 2
        });
        front.tint = black ? 0x252a35 : 0xc1c0ba;
        const side = new PerspectiveMesh({ texture: Texture.WHITE, verticesX: 2, verticesY: 2 });
        side.tint = black ? 0x444956 : 0xa5a8ad;
        side.visible = black;
        this.container.addChild(side, front, top);
        this.faces.push({
          key,
          top,
          front,
          side,
          polygon: [],
          source: { y: sourceY, height: Math.max(1, sourceHeight) }
        });
      }
    }
  }

  draw(camera: WorldCamera, pan: number): void {
    if (!this.texture) return;
    for (const face of this.faces) {
      const key = face.key;
      const centre = camera.sourceX(key.x + key.width / 2 - pan);
      const surface = keySurface(camera, centre, key.black, key.width);
      this.corners(face.top, surface.top);
      this.corners(face.front, surface.front);
      this.corners(face.side, surface.side);
      face.polygon = surface.outline;
      face.topCorners = surface.top;
    }
  }

  pointAt(x: number, y: number): { x: number; y: number } | undefined {
    const geometry = this.geometry;
    if (!geometry) return undefined;
    // Raised black faces cover the whites, so test the paint order backwards.
    for (let i = this.faces.length - 1; i >= 0; i--) {
      const face = this.faces[i];
      if (!face || !insidePolygon(x, y, face.polygon)) continue;
      // The point of the flat keys under the pointer: a wide face (the computer keyboard laid
      // as one slab) holds many keys. A press on the front edge counts as its nearest row.
      const place = face.topCorners && quadPoint(x, y, face.topCorners);
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      return place
        ? {
            x: face.key.x + clamp(place.u) * face.key.width,
            y: geometry.keyboardTop + face.source.y + clamp(place.v) * (face.source.height - 1)
          }
        : {
            x: face.key.x + face.key.width / 2,
            y:
              geometry.keyboardTop +
              (face.key.black ? geometry.blackHeight / 2 : geometry.blackHeight + 1)
          };
    }
    return undefined;
  }

  destroy(): void {
    this.destroyFaces();
    this.frontTexture.destroy(true);
  }
  private corners(mesh: PerspectiveMesh, points: readonly Projected[]): void {
    const [a, b, c, d] = points;
    if (a && b && c && d) mesh.setCorners(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
  }
  private destroyFaces(): void {
    for (const face of this.faces) {
      const texture = face.top.texture;
      for (const mesh of [face.top, face.front, face.side]) {
        mesh.geometry.destroy();
        mesh.destroy();
      }
      texture.destroy();
    }
    this.faces = [];
  }
}

function bakeFront(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return Texture.WHITE;
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.12, "#dfded8");
  gradient.addColorStop(0.75, "#bcbcc1");
  gradient.addColorStop(1, "#686d77");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 64);
  context.fillStyle = "#59606a";
  context.fillRect(0, 0, 0.7, 64);
  context.fillRect(31.3, 0, 0.7, 64);
  return Texture.from(canvas);
}
