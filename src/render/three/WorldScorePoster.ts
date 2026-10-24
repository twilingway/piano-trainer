import {
  type Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace
} from "three";
import type { StaffWorldSnapshot, StaffWorldSource } from "../../staff/staffWorldSnapshot";
import { spotAt } from "../../staff/liveCursor";
import { scoreTileSvg, worldScoreTile, type ScoreTile } from "./worldScoreTile";

export async function rasterWorldScore(
  snapshot: StaffWorldSnapshot,
  tile: ScoreTile
): Promise<CanvasTexture> {
  const url = URL.createObjectURL(
    new Blob([scoreTileSvg(snapshot.svg, tile)], { type: "image/svg+xml" })
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        resolve();
      };
      image.onerror = () => {
        reject(new Error("Staff raster failed"));
      };
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = tile.pixelsWide;
    canvas.height = tile.pixelsHigh;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Staff canvas unavailable");
    context.fillStyle = "#03121c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** One bounded score window in the physical world; the score and clock stay in their owners. */
export class WorldScorePoster {
  readonly group = new Group();
  private readonly geometry = new PlaneGeometry(1500, 1);
  private readonly material = new MeshBasicMaterial({
    color: 0xffffff,
    side: DoubleSide,
    toneMapped: false
  });
  private readonly sheet = new Mesh(this.geometry, this.material);
  private readonly cursorGeometry = new PlaneGeometry(2.5, 1);
  private readonly cursorMaterial = new MeshBasicMaterial({
    color: 0x00e5ff,
    side: DoubleSide,
    toneMapped: false
  });
  private readonly cursor = new Mesh(this.cursorGeometry, this.cursorMaterial);
  private source: StaffWorldSource | undefined;
  private unsubscribe: (() => void) | undefined;
  private snapshot: StaffWorldSnapshot | undefined;
  private texture: CanvasTexture | undefined;
  private tile: ScoreTile | undefined;
  private requested = "";
  private generation = 0;
  private disposed = false;
  private active = false;
  private direct: boolean | undefined;
  private height = 400;
  constructor(
    private readonly limit: number,
    private readonly boundsChanged: () => void = () => undefined,
    private readonly raster = rasterWorldScore
  ) {
    this.sheet.scale.y = this.height;
    this.material.visible = false;
    this.cursor.visible = false;
    this.cursor.position.z = 0.5;
    this.group.add(this.sheet, this.cursor);
    this.group.visible = false;
  }
  setSource(source: StaffWorldSource | undefined): void {
    if (this.disposed || this.source === source) return;
    this.unsubscribe?.();
    this.generation++;
    this.source?.setStatus("idle");
    this.source = source;
    this.snapshot = undefined;
    this.requested = "";
    this.unsubscribe = source?.subscribe(this.invalidate);
    this.invalidate();
  }
  private readonly invalidate = (): void => {
    this.generation++;
    this.requested = "";
    this.snapshot = this.source?.snapshot;
    this.material.visible = false;
    this.cursor.visible = false;
    this.source?.setStatus(
      this.active && this.source.enabled && this.snapshot ? "loading" : "idle"
    );
    this.boundsChanged();
  };
  update(on: boolean, direct: boolean, centreX = 0, bottom = 2222): void {
    if (this.disposed) return;
    const active = on && this.source?.enabled === true;
    if (direct !== this.direct) {
      this.direct = direct;
      this.boundsChanged();
    }
    if (active !== this.active) {
      this.active = active;
      this.boundsChanged();
      if (!active) {
        this.generation++;
        this.requested = "";
        this.source?.setStatus("idle");
      }
    }
    this.group.visible = active;
    this.group.position.set(centreX, bottom + this.height / 2, -260);
    const snapshot = this.snapshot,
      source = this.source;
    if (!active || !snapshot || !source) return;
    const spot = spotAt(snapshot.spots, source.readBeat()) ?? { x: 0, line: 0 };
    const desired = worldScoreTile(snapshot, spot.x, spot.line, this.limit);
    const height = Math.max(180, Math.min(600, (1500 * desired.viewHeight) / desired.viewWidth));
    if (height !== this.height) {
      this.height = height;
      this.sheet.scale.y = height;
      this.group.position.y = bottom + height / 2;
      this.boundsChanged();
    }
    const key = `${String(desired.left)}:${String(desired.top)}:${String(desired.width)}:${String(desired.height)}`;
    if (this.requested !== key) {
      this.requested = key;
      const generation = ++this.generation;
      if (!this.material.visible) source.setStatus("loading");
      void this.raster(snapshot, desired)
        .then((texture) => {
          if (
            this.disposed ||
            generation !== this.generation ||
            this.source !== source ||
            !this.active ||
            !source.enabled
          ) {
            texture.dispose();
            return;
          }
          this.texture?.dispose();
          this.texture = texture;
          this.tile = desired;
          this.material.map = texture;
          this.material.visible = true;
          this.material.needsUpdate = true;
          source.setStatus("ready");
        })
        .catch(() => {
          if (!this.disposed && generation === this.generation) {
            this.material.visible = false;
            this.cursor.visible = false;
            source.setStatus("error");
          }
        });
    }
    const tile = this.tile;
    if (!tile || !this.texture || !this.material.visible) return;
    const left = Math.max(
      tile.left,
      Math.min(tile.left + tile.width - desired.viewWidth, desired.viewLeft)
    );
    const top = Math.max(
      tile.top,
      Math.min(tile.top + tile.height - desired.viewHeight, desired.viewTop)
    );
    this.texture.repeat.set(desired.viewWidth / tile.width, desired.viewHeight / tile.height);
    this.texture.offset.set(
      (left - tile.left) / tile.width,
      1 - (top - tile.top + desired.viewHeight) / tile.height
    );
    const line = snapshot.lines.find((line) => line.top >= spot.line - 1) ?? snapshot.lines[0];
    const cursorHeight = Math.min(
      desired.viewHeight,
      line ? line.bottom - line.top : desired.viewHeight
    );
    this.cursor.visible = true;
    this.cursor.scale.y = (cursorHeight / desired.viewHeight) * this.height;
    this.cursor.position.x = ((spot.x - left) / desired.viewWidth - 0.5) * 1500;
    this.cursor.position.y =
      (0.5 - (spot.line + cursorHeight / 2 - top) / desired.viewHeight) * this.height;
  }
  structuralBounds(target: Box3): Box3 {
    this.group.updateWorldMatrix(true, false);
    target.min.set(-750, -this.height / 2, 0);
    target.max.set(750, this.height / 2, 0);
    return target.applyMatrix4(this.group.matrixWorld);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.unsubscribe?.();
    this.source?.setStatus("idle");
    this.texture?.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.cursorGeometry.dispose();
    this.cursorMaterial.dispose();
    this.group.removeFromParent();
  }
}
