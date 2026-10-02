import { Assets, Container, Mesh, MeshGeometry, Texture } from "pixi.js";

const GLASS = new URL("../fx/note-glass-block.webp", import.meta.url).href;
const COLUMNS = 4;
const BODY_SEGMENTS = 16;
const ROWS = BODY_SEGMENTS + 3;
const TEXTURE_WIDTH = 96;
const TEXTURE_HEIGHT = 192;
const TOP_CAP = 36;
const BOTTOM_CAP = 38;

type Project = (y: number, offsetX: number, lift?: number) => { x: number; y: number };

interface GlassMesh {
  mesh: Mesh;
  geometry: MeshGeometry;
  positions: Float32Array;
  walls: Mesh;
  wallGeometry: MeshGeometry;
  wallPositions: Float32Array;
}

/** Pooled glass solids: a beveled top, two sides and a luminous front wall. */
export class RoadGlassLayer {
  readonly container = new Container({ sortableChildren: true });
  private texture: Texture | undefined;
  private readonly pool: GlassMesh[] = [];
  private used = 0;
  private disposed = false;

  constructor() {
    this.container.eventMode = "none";
  }

  get ready(): boolean {
    return this.texture !== undefined && !this.disposed;
  }

  async load(): Promise<void> {
    try {
      const texture = await Assets.load<Texture>(GLASS);
      if (!this.disposed) this.texture = texture;
    } catch (error) {
      console.warn("Road glass did not load; keeping plain duration bars", error);
    }
  }

  begin(): void {
    this.used = 0;
  }

  draw(
    top: number,
    bottom: number,
    width: number,
    tint: number,
    alpha: number,
    project: Project
  ): void {
    if (!this.ready || bottom <= top || width <= 0 || alpha <= 0) return;
    const entry = this.pool[this.used] ?? this.create();
    this.used++;
    const height = bottom - top;
    const scale = width / TEXTURE_WIDTH;
    const capShare = Math.min(1, height / ((TOP_CAP + BOTTOM_CAP) * scale));
    const topSize = TOP_CAP * scale * capShare;
    const bottomSize = BOTTOM_CAP * scale * capShare;
    const bodyHeight = Math.max(0, height - topSize - bottomSize);
    const positions = entry.positions;

    for (let row = 0; row < ROWS; row++) {
      const y =
        row === 0
          ? top
          : row === ROWS - 1
            ? bottom
            : top + topSize + (bodyHeight * (row - 1)) / BODY_SEGMENTS;
      for (let column = 0; column < COLUMNS; column++) {
        // The 32-pixel sides contain the baked glow, edge and inner bevel.
        const offsetX = width * (column / (COLUMNS - 1) - 0.5);
        const point = project(y, offsetX, width * 0.2);
        const index = (row * COLUMNS + column) * 2;
        positions[index] = point.x;
        positions[index + 1] = point.y;
      }
    }
    entry.geometry.getBuffer("aPosition").update();
    entry.mesh.tint = tint;
    entry.mesh.alpha = Math.min(1, alpha);
    entry.mesh.visible = true;
    entry.mesh.zIndex = bottom * 2 + 1;
    // Each face uses the same neutral Arcadia material, tinted by the finger.
    const left = -width / 2;
    const right = width / 2;
    for (let face = 0; face < 3; face++) {
      const firstY = face === 0 ? top : bottom;
      const secondY = face === 2 ? top : bottom;
      const firstX = face === 2 ? right : left;
      const secondX = face === 0 ? left : right;
      for (let corner = 0; corner < 4; corner++) {
        const first = corner === 0 || corner === 3;
        const point = project(
          first ? firstY : secondY,
          first ? firstX : secondX,
          corner < 2 ? width * 0.2 : 0
        );
        const index = (face * 4 + corner) * 2;
        entry.wallPositions[index] = point.x;
        entry.wallPositions[index + 1] = point.y;
      }
    }
    entry.wallGeometry.getBuffer("aPosition").update();
    entry.walls.tint = tint;
    entry.walls.alpha = Math.min(1, alpha);
    entry.walls.visible = true;
    entry.walls.zIndex = bottom * 2;
  }

  end(): void {
    let index = 0;
    for (const entry of this.pool) {
      if (index++ >= this.used) entry.mesh.visible = entry.walls.visible = false;
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.pool) {
      // Mesh.destroy does not own its geometry or the shared Assets texture.
      if (!entry.mesh.destroyed) entry.mesh.destroy();
      entry.geometry.destroy();
      if (!entry.walls.destroyed) entry.walls.destroy();
      entry.wallGeometry.destroy();
    }
    this.pool.length = 0;
    this.texture = undefined;
    if (!this.container.destroyed) this.container.destroy();
  }

  private create(): GlassMesh {
    const positions = new Float32Array(ROWS * COLUMNS * 2);
    const uvs = new Float32Array(positions.length);
    const indices = new Uint32Array((ROWS - 1) * (COLUMNS - 1) * 6);
    for (let row = 0; row < ROWS; row++) {
      const v =
        row === 0
          ? 0
          : row === ROWS - 1
            ? 1
            : (TOP_CAP + ((TEXTURE_HEIGHT - TOP_CAP - BOTTOM_CAP) * (row - 1)) / BODY_SEGMENTS) /
              TEXTURE_HEIGHT;
      for (let column = 0; column < COLUMNS; column++) {
        const index = (row * COLUMNS + column) * 2;
        uvs[index] = 0.15 + (0.7 * column) / (COLUMNS - 1);
        uvs[index + 1] = 0.07 + v * 0.86;
      }
    }
    let index = 0;
    for (let row = 0; row < ROWS - 1; row++) {
      for (let column = 0; column < COLUMNS - 1; column++) {
        const a = row * COLUMNS + column;
        const b = a + 1;
        const c = a + COLUMNS;
        const d = c + 1;
        indices[index++] = a;
        indices[index++] = b;
        indices[index++] = d;
        indices[index++] = a;
        indices[index++] = d;
        indices[index++] = c;
      }
    }
    const geometry = new MeshGeometry({ positions, uvs, indices });
    const mesh = new Mesh({ geometry, texture: this.texture ?? Texture.WHITE });
    mesh.eventMode = "none";
    mesh.blendMode = "add";
    const wallPositions = new Float32Array(24);
    const wallUvs = new Float32Array(24);
    const wallIndices = new Uint32Array(18);
    for (let face = 0; face < 3; face++) {
      wallUvs.set([0.15, 0.78, 0.85, 0.78, 0.85, 0.91, 0.15, 0.91], face * 8);
      const vertex = face * 4;
      wallIndices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], face * 6);
    }
    const wallGeometry = new MeshGeometry({
      positions: wallPositions,
      uvs: wallUvs,
      indices: wallIndices
    });
    const walls = new Mesh({ geometry: wallGeometry, texture: this.texture ?? Texture.WHITE });
    walls.eventMode = "none";
    walls.blendMode = "add";
    this.container.addChild(walls, mesh);
    const entry = { mesh, geometry, positions, walls, wallGeometry, wallPositions };
    this.pool.push(entry);
    return entry;
  }
}
