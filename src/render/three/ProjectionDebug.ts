import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, DoubleSide } from "three";
import { messages } from "../../i18n/messages";
import { translate } from "../../i18n/translate";
import type { ProjectionLayout } from "../stylizedProjection";
import { sampleProjectionLaneAtY } from "../stylizedProjection";

/** Baked only when the mapping changes, including its labels and diagnostic counters. */
export class ProjectionDebug {
  private readonly canvas = document.createElement("canvas");
  private readonly texture = new CanvasTexture(this.canvas);
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material = new MeshBasicMaterial({
    map: this.texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  readonly mesh = new Mesh(this.geometry, this.material);

  constructor() {
    this.texture.flipY = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }
  update(layout: ProjectionLayout): void {
    const { width, height, parameters } = layout;
    this.mesh.visible = parameters.debugMapping || !layout.valid;
    if (!this.mesh.visible) return;
    const scale = Math.min(1, 2048 / Math.max(width, height));
    const pixelWidth = Math.ceil(width * scale),
      pixelHeight = Math.ceil(height * scale);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      // WebGL2 canvas textures use immutable storage; resize requires a fresh GPU allocation.
      this.texture.dispose();
    }
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    const point = { x: 0, y: 0 };
    if (parameters.debugMapping)
      for (const lane of layout.lanes) {
        if (parameters.debugEvery12 && lane.index % 12 !== 0 && lane.pitch !== 60) continue;
        ctx.strokeStyle = lane.pitch === 60 ? "#fff600" : lane.index % 2 ? "#58e4ff" : "#fd79ff";
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = lane.pitch === 60 ? 2 : 0.65;
        ctx.beginPath();
        let y = Math.max(0, lane.horizon.y);
        const endY = Math.min(height, lane.key.y);
        sampleProjectionLaneAtY(layout, lane, y, point);
        ctx.moveTo(point.x, point.y);
        while (y < endY) {
          y = Math.min(endY, (Math.floor(y / (height / 64) + 1e-7) + 1) * (height / 64));
          sampleProjectionLaneAtY(layout, lane, y, point);
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        for (const end of [lane.horizon, lane.key]) {
          ctx.fillRect(end.x - 2, end.y - 2, 4, 4);
          ctx.save();
          ctx.translate(end.x, end.y - 5);
          ctx.rotate(-Math.PI / 3);
          ctx.font = "9px sans-serif";
          ctx.fillText(`${String(lane.index)}/${String(lane.pitch)}`, 0, 0);
          ctx.restore();
        }
      }
    const locale = document.documentElement.lang.startsWith("en") ? "en" : "ru";
    const t = (key: string, values?: Record<string, string | number>) =>
      translate(locale, messages, key, values);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#041a28";
    ctx.fillRect(8, 48, Math.min(width - 16, 760), 62);
    ctx.fillStyle = "#abf5ff";
    ctx.fillText(
      t("Проекция: дорожек {lanes}, пересечений {crossings}", {
        lanes: layout.lanes.length,
        crossings: layout.diagnostics.laneCrossings
      }),
      16,
      65
    );
    ctx.fillText(
      t("Проекция: эффективный радиус {radius}", { radius: layout.effectiveRadius.toFixed(1) }),
      16,
      82
    );
    ctx.fillText(layout.warnings.join(" · ") || "laneCrossings=0", 16, 99);
    if (!layout.valid)
      ctx.fillText(
        t(
          "Художественная проекция недоступна для этого ракурса. Измените ракурс или вернитесь к пианино."
        ),
        16,
        126
      );
    this.mesh.position.set(width / 2, height / 2, 0);
    this.mesh.scale.set(width, height, 1);
    this.texture.needsUpdate = true;
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
