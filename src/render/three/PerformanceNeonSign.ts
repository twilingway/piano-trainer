import {
  AdditiveBlending,
  CanvasTexture,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3
} from "three";
import type { Camera } from "three";
import type { Finger } from "../../fingering/fingering";
import { FINGER_COLOR } from "../fingerColors";
import type { PerformanceSignPlacement } from "./performanceStageLayout";

export interface NeonLetter {
  readonly character: string;
  readonly color: number;
  /** Letters and digits take the next finger colour; spaces and punctuation keep the last one. */
  readonly letter: boolean;
}

/** Finger colours 1–5 in turn over the letters; Cyrillic counts as letters too. */
export function neonSignLetters(text: string): NeonLetter[] {
  let next = 0,
    color = FINGER_COLOR[1];
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
  return Array.from(graphemes, ({ segment: character }) => {
    const letter = /[\p{L}\p{N}]/u.test(character);
    if (letter) color = FINGER_COLOR[((next++ % 5) + 1) as Finger];
    return { character, color, letter };
  });
}

const FONT_PX = 160;
const PAD = 96;
const MAX_CANVAS = 4096;
const FONT = `600 ${String(FONT_PX)}px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
/** Wide soft halo, a tighter glow, then the tube itself. */
const GLOW = [
  { blur: 64, alpha: 0.55 },
  { blur: 28, alpha: 0.8 },
  { blur: 10, alpha: 1 }
] as const;

const css = (color: number, alpha = 1, pale = 0): string => {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    return Math.round(value + (255 - value) * pale);
  };
  return `rgba(${String(channel(16))}, ${String(channel(8))}, ${String(channel(0))}, ${String(alpha)})`;
};

/** One plane of baked neon text; a frame changes only its opacity and visibility. */
export class PerformanceNeonSign {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private readonly eye = new Vector3();
  private aspect = 1;
  private readonly size = { width: 1, height: 1 };
  private textValue = "";

  constructor(text: string) {
    this.canvas = document.createElement("canvas");
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: FrontSide
      })
    );
    this.mesh.name = "performance-neon-sign";
    // The plane's front looks along -Z, towards the keyboard and the front cameras.
    this.mesh.rotation.y = Math.PI;
    this.mesh.visible = false;
    this.setText(text);
  }

  get text(): string {
    return this.textValue;
  }

  setText(text: string): void {
    if (text === this.textValue) return;
    this.textValue = text;
    const letters = neonSignLetters(text);
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.font = FONT;
    const widths = letters.map(({ character }) => context.measureText(character).width);
    const textWidth = widths.reduce((sum, width) => sum + width, 0);
    // A long text shrinks to the largest canvas rather than being cut.
    const scale = Math.min(1, (MAX_CANVAS - 2 * PAD) / Math.max(1, textWidth));
    const width = Math.ceil(textWidth * scale + 2 * PAD),
      height = Math.ceil(FONT_PX * 1.3 * scale + 2 * PAD);
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.replaceTexture();
    }
    this.aspect = this.canvas.height / this.canvas.width;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.font = FONT;
    context.setTransform(scale, 0, 0, scale, PAD, this.canvas.height / 2);
    context.textBaseline = "middle";
    context.lineJoin = "round";
    const draw = (paint: (letter: NeonLetter, x: number) => void) => {
      let x = 0;
      letters.forEach((letter, index) => {
        if (letter.character.trim() !== "") paint(letter, x);
        x += widths[index] ?? 0;
      });
    };
    for (const { blur, alpha } of GLOW)
      draw((letter, x) => {
        context.shadowColor = css(letter.color);
        context.shadowBlur = blur;
        context.fillStyle = css(letter.color, alpha);
        context.fillText(letter.character, x, 0);
      });
    // The bright pale core of the tube.
    draw((letter, x) => {
      context.shadowColor = css(letter.color);
      context.shadowBlur = 6;
      context.lineWidth = 5;
      context.strokeStyle = css(letter.color, 1, 0.75);
      context.strokeText(letter.character, x, 0);
    });
    context.setTransform(1, 0, 0, 1, 0, 0);
    this.texture.needsUpdate = true;
  }

  /** WebGL2 sizes an uploaded texture's storage once: a canvas of a new size needs a new texture. */
  private replaceTexture(): void {
    this.texture.dispose();
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.mesh.material.map = this.texture;
    this.mesh.material.needsUpdate = true;
  }

  /** The widest the placement allows, never taller than its height limit. */
  layout(placement: PerformanceSignPlacement): void {
    const width = Math.min(placement.width, placement.maxHeight / this.aspect),
      height = width * this.aspect;
    this.size.width = width;
    this.size.height = height;
    this.mesh.scale.set(width, height, 1);
    this.mesh.position.set(placement.base.x, placement.base.y + height / 2, placement.base.z);
  }

  /** `fade` is the stage light's, `flash` a bass burst's; the flicker follows song time, so a seek repeats it. */
  update(time: number, camera: Camera, fade: number, flash = 0): void {
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    // From behind the plane the text would read mirrored.
    const front = this.eye.z < this.mesh.position.z;
    const seconds = Number.isFinite(time) ? time : 0;
    const flicker = 0.94 + 0.04 * Math.sin(seconds * 7.3) + 0.02 * Math.sin(seconds * 23.9 + 1.3);
    this.mesh.material.opacity = Math.max(0, Math.min(1, fade)) * flicker;
    // Not tone mapped: a colour above 1 makes the additive glow brighter than the texture.
    const burst = Math.max(0, Math.min(1, flash));
    this.mesh.material.color.setScalar(1 + 1.6 * burst);
    // Brightness alone saturates in the glow; the sign also swells with the bass.
    const swell = 1 + 0.14 * burst;
    this.mesh.scale.set(this.size.width * swell, this.size.height * swell, 1);
    this.mesh.visible = front && fade > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.texture.dispose();
    this.mesh.material.dispose();
    this.mesh.geometry.dispose();
  }
}
