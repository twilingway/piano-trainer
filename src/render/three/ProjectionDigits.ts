import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  DoubleSide
} from "three";
const CORNERS = [0, 1, 2, 2, 1, 3];

/** One baked atlas and one reusable batch for moving fingering labels. */
export class ProjectionDigits {
  private readonly canvas = document.createElement("canvas");
  private readonly texture: CanvasTexture;
  private readonly geometry = new BufferGeometry();
  private readonly positions = new BufferAttribute(new Float32Array(1024 * 6 * 3), 3);
  private readonly uv = new BufferAttribute(new Float32Array(1024 * 6 * 2), 2);
  private readonly material: MeshBasicMaterial;
  readonly mesh: Mesh;
  private used = 0;
  private readonly slots = new Map<string, number>();
  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 2048;
    this.texture = new CanvasTexture(this.canvas);
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide
    });
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("uv", this.uv);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
  begin(): void {
    this.used = 0;
  }
  add(finger: number | undefined, x: number, y: number, size: number): void {
    if (!finger || finger < 1 || finger > 5 || this.used >= 1024 || size < 3) return;
    this.addText(String(finger), x, y, size);
  }
  addText(text: string | undefined, x: number, y: number, size: number): void {
    if (!text || size < 3 || this.used >= 1024) return;
    let slot = this.slots.get(text);
    if (slot === undefined) {
      if (this.slots.size >= 256) return;
      slot = this.slots.size;
      this.slots.set(text, slot);
      const ctx = this.canvas.getContext("2d");
      if (ctx) {
        ctx.font = text.length === 1 ? "bold 42px sans-serif" : "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const sx = (slot % 8) * 128 + 64,
          sy = Math.floor(slot / 8) * 64 + 32;
        ctx.strokeStyle = "#063342";
        ctx.lineWidth = 4;
        ctx.strokeText(text, sx, sy, 124);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, sx, sy, 124);
      }
      this.texture.needsUpdate = true;
    }
    for (let j = 0; j < 6; j++) {
      const c = CORNERS[j] ?? 0,
        right = c % 2,
        bottom = c >= 2 ? 1 : 0,
        i = this.used * 6 + j;
      this.positions.setXYZ(i, x + (right - 0.5) * size * 2, y + (bottom - 0.5) * size, 0);
      this.uv.setXY(i, ((slot % 8) + right) / 8, 1 - (Math.floor(slot / 8) + bottom) / 32);
    }
    this.used++;
  }
  end(): void {
    this.geometry.setDrawRange(0, this.used * 6);
    if (this.used === 0) return;
    for (const attribute of [this.positions, this.uv]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.used * 6 * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
