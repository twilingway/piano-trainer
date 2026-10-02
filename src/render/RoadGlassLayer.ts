import { Assets, Container, Mesh, MeshGeometry, Texture } from "pixi.js";

const GLASS = new URL("../fx/note-glass-block.webp", import.meta.url).href;
const FIRE = new URL("../fx/note-hold-fire.webp", import.meta.url).href;
const FIRE_COLUMNS = 6;
const FIRE_FRAMES = 24;
const FIRE_ATLAS_ROWS = FIRE_FRAMES / FIRE_COLUMNS;
const FIRE_FPS = 15;
const FIRE_SEGMENTS = 12;
const FIRE_ROWS = FIRE_SEGMENTS + 1;
const COLUMNS = 4;
const BODY_SEGMENTS = 16;
const ROWS = BODY_SEGMENTS + 3;
const TEXTURE_WIDTH = 96;
const TEXTURE_HEIGHT = 192;
const TOP_CAP = 36;
const BOTTOM_CAP = 38;
const GLASS_LIFT_SHARE = 0.28;
// Keep every projected edge inside the opaque glass, away from the atlas halo.
const SOLID_LEFT_U = 20 / TEXTURE_WIDTH;
const SOLID_RIGHT_U = 75 / TEXTURE_WIDTH;
const SOLID_TOP_V = 29 / TEXTURE_HEIGHT;
const SOLID_BOTTOM_V = 169 / TEXTURE_HEIGHT;

type Project = (y: number, offsetX: number, lift?: number) => { x: number; y: number };

interface GlassMesh {
  backing: Mesh;
  mesh: Mesh;
  geometry: MeshGeometry;
  positions: Float32Array;
  walls: Mesh;
  wallGeometry: MeshGeometry;
  wallPositions: Float32Array;
  smoke: Mesh;
  smokeGeometry: MeshGeometry;
  smokePositions: Float32Array;
  smokeUvs: Float32Array;
  smokeFrame: number;
}

/** Pooled glass solids: a beveled top, two sides and a luminous front wall. */
export class RoadGlassLayer {
  readonly container = new Container({ sortableChildren: true });
  private texture: Texture | undefined;
  private fireAtlas: Texture | undefined;
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
    try {
      const atlas = await Assets.load<Texture>(FIRE);
      if (!this.disposed) this.fireAtlas = atlas;
    } catch (error) {
      console.warn("Road hold fire did not load; keeping steady glass", error);
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
    time: number,
    hitY: number,
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
        const point = project(y, offsetX, width * GLASS_LIFT_SHARE);
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
    // A dark backing shows through the transparent bevel as black side stripes.
    entry.backing.tint = tint;
    entry.backing.alpha = Math.min(0.55, alpha * 0.55);
    entry.backing.visible = true;
    entry.backing.zIndex = bottom * 2 + 0.5;
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
          corner < 2 ? width * GLASS_LIFT_SHARE : 0
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
    const smoke = entry.smoke;
    smoke.visible = this.fireAtlas !== undefined;
    if (smoke.visible && this.fireAtlas) {
      const frame = Math.floor((time * FIRE_FPS + this.used * 5) % FIRE_FRAMES);
      if (smoke.texture !== this.fireAtlas) smoke.texture = this.fireAtlas;
      if (entry.smokeFrame !== frame) {
        const frameU = (frame % FIRE_COLUMNS) / FIRE_COLUMNS;
        const frameV = Math.floor(frame / FIRE_COLUMNS) / FIRE_ATLAS_ROWS;
        for (let row = 0; row < FIRE_ROWS; row++) {
          const v = frameV + row / (FIRE_SEGMENTS * FIRE_ATLAS_ROWS);
          const index = row * 4;
          entry.smokeUvs[index] = frameU;
          entry.smokeUvs[index + 1] = v;
          entry.smokeUvs[index + 2] = frameU + 1 / FIRE_COLUMNS;
          entry.smokeUvs[index + 3] = v;
        }
        entry.smokeGeometry.getBuffer("aUV").update();
        entry.smokeFrame = frame;
      }
      const fireTop = top - height * 0.12 - width * 0.05;
      // The atlas fades at its edges. Let only a short tail pass the glass, never the hit line.
      const fireBottom = Math.min(hitY, bottom + height * 0.18 + width * 0.2);
      for (let row = 0; row < FIRE_ROWS; row++) {
        const y = fireTop + ((fireBottom - fireTop) * row) / FIRE_SEGMENTS;
        const leftSmoke = project(y, -width, width * 0.45);
        const rightSmoke = project(y, width, width * 0.45);
        const index = row * 4;
        entry.smokePositions[index] = leftSmoke.x;
        entry.smokePositions[index + 1] = leftSmoke.y;
        entry.smokePositions[index + 2] = rightSmoke.x;
        entry.smokePositions[index + 3] = rightSmoke.y;
      }
      entry.smokeGeometry.getBuffer("aPosition").update();
      smoke.tint = tint;
      smoke.alpha = Math.min(0.9, alpha * 0.9);
      smoke.zIndex = bottom * 2 + 2;
    }
  }

  end(): void {
    let index = 0;
    for (const entry of this.pool) {
      if (index++ >= this.used)
        entry.mesh.visible =
          entry.backing.visible =
          entry.walls.visible =
          entry.smoke.visible =
            false;
    }
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.pool) {
      // Mesh.destroy does not own its geometry or the shared Assets texture.
      if (!entry.backing.destroyed) entry.backing.destroy();
      if (!entry.mesh.destroyed) entry.mesh.destroy();
      entry.geometry.destroy();
      if (!entry.walls.destroyed) entry.walls.destroy();
      entry.wallGeometry.destroy();
      entry.smoke.destroy();
      entry.smokeGeometry.destroy();
    }
    this.pool.length = 0;
    this.fireAtlas = undefined;
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
        uvs[index] = SOLID_LEFT_U + ((SOLID_RIGHT_U - SOLID_LEFT_U) * column) / (COLUMNS - 1);
        uvs[index + 1] = SOLID_TOP_V + v * (SOLID_BOTTOM_V - SOLID_TOP_V);
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
    // The opaque face hides the road markings beneath translucent luminous glass.
    const backing = new Mesh({ geometry, texture: Texture.WHITE });
    backing.eventMode = "none";
    const mesh = new Mesh({ geometry, texture: this.texture ?? Texture.WHITE });
    mesh.eventMode = "none";
    mesh.blendMode = "add";
    const wallPositions = new Float32Array(24);
    const wallUvs = new Float32Array(24);
    const wallIndices = new Uint32Array(18);
    for (let face = 0; face < 3; face++) {
      wallUvs.set(
        [SOLID_LEFT_U, 0.78, SOLID_RIGHT_U, 0.78, SOLID_RIGHT_U, 0.88, SOLID_LEFT_U, 0.88],
        face * 8
      );
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
    const smokePositions = new Float32Array(FIRE_ROWS * 4);
    const smokeUvs = new Float32Array(smokePositions.length);
    const smokeIndices = new Uint32Array(FIRE_SEGMENTS * 6);
    for (let row = 0; row < FIRE_SEGMENTS; row++) {
      const vertex = row * 2;
      smokeIndices.set([vertex, vertex + 1, vertex + 3, vertex, vertex + 3, vertex + 2], row * 6);
    }
    const smokeGeometry = new MeshGeometry({
      positions: smokePositions,
      uvs: smokeUvs,
      indices: smokeIndices
    });
    const smoke = new Mesh({ geometry: smokeGeometry, texture: this.fireAtlas ?? Texture.WHITE });
    smoke.blendMode = "add";
    smoke.eventMode = "none";
    this.container.addChild(walls, backing, mesh, smoke);
    const entry = {
      backing,
      mesh,
      geometry,
      positions,
      walls,
      wallGeometry,
      wallPositions,
      smoke,
      smokeGeometry,
      smokePositions,
      smokeUvs,
      smokeFrame: -1
    };
    this.pool.push(entry);
    return entry;
  }
}
