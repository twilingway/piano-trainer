import { Container, NineSliceSprite, Sprite, Text, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import { pitchLabel } from "../input/keyboardLayouts";
import type { KeyEvent } from "../input/midiInput";
import { keyDisplay } from "../wordTyping/inputTokens";
import { typingFinger } from "../wordTyping/touchTyping";
import type { ComputerKeys } from "./computerKeys";
import { layoutComputerKeys } from "./computerKeyboardLayout";
import type { KeyFace } from "./computerKeyboardLayout";
import { TYPING_FINGER_COLOR, towardWhite } from "./fingerColors";
import type { KeyboardLayer, KeysFrame } from "./KeyboardLayer";
import type { Geometry } from "./viewGeometry";

/** What the view asks of a keyboard, the piano's or the computer's. */
export type KeysLayer = Pick<
  KeyboardLayer,
  "container" | "layout" | "draw" | "pitchAt" | "pressWithMouse" | "releaseMouse" | "showFelt"
>;

/** The baked key material: a square this big, its corners this round, its halo this wide. */
const REF = 64;
const RADIUS = 12;
const HALO = 18;
/** A key with nothing on it, a service key, their captions, the case, the space bar's light. */
const IDLE = 0x2c3b55;
const IDLE_CAPTION = 0x6d82a3;
const CASE = 0x060d18;
const SPACE = 0x00e5ff;
const DARK = 0x04101c;
/** The felt over the keys and its neon edge, as over the piano's. */
const FELT = 0x003b62;
const FELT_EDGE = 0x00e5ff;
/** The glass and the halo of a typing key: at rest, next in line, owed or held. */
const LOOK = {
  idle: { glass: 0.82, halo: 0.5 },
  next: { glass: 0.95, halo: 0.85 },
  due: { glass: 1, halo: 1 },
  pressed: { glass: 1, halo: 1 }
} as const;
/** A held key sinks this share of its height. */
const SINK_SHARE = 0.06;
/** The digits' shifted signs, printed over them as on a real keyboard. */
const SHIFTED: Readonly<Record<"ru" | "en", Readonly<Record<string, string>>>> = {
  en: { Backquote: "~", Digit1: "!", Digit2: "@", Digit3: "#", Digit4: "$", Digit5: "%" },
  ru: { Backquote: "Ё", Digit1: "!", Digit2: '"', Digit3: "№", Digit4: ";", Digit5: "%" }
};
const SHIFTED_COMMON: Readonly<Record<string, string>> = {
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Digit0: ")",
  Minus: "_",
  Equal: "+"
};
const SHIFTED_RU: Readonly<Record<string, string>> = { Digit6: ":", Digit7: "?" };

type KeyState = keyof typeof LOOK;

interface KeySprites {
  readonly face: KeyFace;
  readonly halo: NineSliceSprite;
  readonly base: NineSliceSprite;
  readonly glass: NineSliceSprite;
  readonly edge: NineSliceSprite;
  readonly label: Sprite;
  color: number;
  assigned: boolean;
}

/**
 * The word mode's keyboard, a real one in its case: each typing key glass in its touch-typing
 * finger's colour with a neon edge, what it types on it; the owed key lit, the next one glowing,
 * a held one sunk; the service keys dim around them. It stands where the piano's keyboard does
 * and answers the view the same way. The material is baked once, the captions per layout.
 */
export class ComputerKeyboardLayer implements KeysLayer {
  readonly container = new Container();
  private readonly casing: NineSliceSprite;
  private readonly keysLayer = new Container();
  private readonly felt = new Container();
  private readonly material: Readonly<Record<"halo" | "base" | "glass" | "edge", Texture>>;
  private keys: KeySprites[] = [];
  private labelTextures: Texture[] = [];
  /** The falling notes' letters, baked the first time one is needed and kept with the layer. */
  private readonly letters = new Map<string, Texture>();
  private computer: ComputerKeys | undefined;
  /** Note names under the letters, like the piano keys' stickers. */
  private names = false;
  private mouseKey: number | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly onKeyPointer: (event: KeyEvent) => void
  ) {
    this.material = bakeMaterial();
    this.casing = slice(this.material.base, 0);
    this.casing.tint = CASE;
    this.casing.eventMode = "none";
    this.container.addChild(this.felt, this.casing, this.keysLayer);
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("blur", this.onLeave);
  }

  /** The inputs to show, or none: every key then stands empty. */
  setKeys(computer: ComputerKeys | undefined): void {
    this.computer = computer;
    this.relabel();
  }

  /**
   * Follows the physical keys while it lives: one pitch may sit on several keys, so the one held
   * is the one that sinks and bursts. Shown only: the input listener plays the notes.
   */
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!event.repeat) this.computer?.hold(event.code, true);
  };
  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.computer?.hold(event.code, false);
  };
  private readonly onLeave = () => {
    this.computer?.releaseAll();
  };

  showFelt(show: boolean): void {
    this.felt.visible = show;
  }

  showStickers(show: boolean): void {
    if (show === this.names) return;
    this.names = show;
    this.relabel();
  }

  /** Lays every key in its row `total` pixels wide where `geometry` puts the keyboard. */
  layout(_keys: unknown, geometry: Geometry, total: number): void {
    const { faces } = layoutComputerKeys(total, geometry);
    for (const key of this.keys) {
      for (const sprite of [key.halo, key.base, key.glass, key.edge, key.label]) sprite.destroy();
    }
    this.keys = [];
    const pad = (faces[0]?.height ?? 0) * 0.18;
    place(
      this.casing,
      -pad,
      geometry.keyboardTop - pad,
      total + pad * 2,
      geometry.keyboardHeight + pad * 2,
      0
    );
    this.casing.visible = geometry.keyboardHeight > 0;
    this.casing.alpha = 0.92;
    for (const face of faces) {
      if (face.width < 2 || face.height < 2) continue;
      const halo = slice(this.material.halo, HALO);
      const base = slice(this.material.base, 0);
      const glass = slice(this.material.glass, 0);
      const edge = slice(this.material.edge, 0);
      const label = new Sprite();
      label.anchor.set(0.5);
      halo.blendMode = "add";
      for (const sprite of [halo, glass, edge, label]) sprite.eventMode = "none";
      if (face.pitch !== undefined) {
        const pitch = face.pitch;
        base.eventMode = "static";
        base.cursor = "pointer";
        base.on("pointerdown", () => {
          this.pressWithMouse(pitch);
        });
        base.on("pointerup", () => {
          this.releaseMouse();
        });
        base.on("pointerupoutside", () => {
          this.releaseMouse();
        });
      } else base.eventMode = "none";
      this.keysLayer.addChild(halo, base, glass, edge, label);
      this.keys.push({ face, halo, base, glass, edge, label, color: IDLE, assigned: false });
    }
    this.placeFelt(geometry, total);
    this.relabel();
  }

  /** Lights the keys for this frame: the owed key, the next one, the held and sounding ones. */
  draw(frame: KeysFrame): void {
    const hints = frame.hints !== false;
    const next = hints ? this.computer?.next()?.pitch : undefined;
    for (const key of this.keys) {
      const { face, halo, base, glass, edge, label } = key;
      const pitch = face.pitch;
      const state: KeyState =
        pitch === undefined
          ? "idle"
          : frame.pressed.has(pitch) || frame.sounding.has(pitch)
            ? "pressed"
            : hints && frame.due.some((note) => note.pitch === pitch)
              ? "due"
              : pitch === next
                ? "next"
                : "idle";
      const sink = state === "pressed" ? face.height * SINK_SHARE : 0;
      const scale = face.height / REF;
      for (const sprite of [base, glass, edge]) {
        place(sprite, face.x, face.y + sink, face.width, face.height, scale);
      }
      place(halo, face.x, face.y + sink, face.width, face.height, scale, HALO);
      label.position.set(face.x + face.width / 2, face.y + face.height / 2 + sink);
      base.tint = DARK;
      if (!key.assigned) {
        const space = face.code === "Space";
        glass.tint = IDLE;
        glass.alpha = 0.35;
        edge.tint = space ? SPACE : IDLE;
        edge.alpha = space ? 0.7 : 0.85;
        halo.tint = SPACE;
        halo.alpha = space ? 0.3 : 0;
        label.tint = IDLE_CAPTION;
        continue;
      }
      const lit = state === "due" || state === "pressed";
      glass.tint = key.color;
      glass.alpha = LOOK[state].glass;
      edge.tint = lit ? towardWhite(key.color, 0.6) : key.color;
      edge.alpha = 1;
      halo.tint = key.color;
      halo.alpha = LOOK[state].halo;
      // The letters burn bright, white on the lit key, near white in the finger's colour else.
      label.tint = lit ? 0xffffff : towardWhite(key.color, 0.85);
    }
  }

  /** The typing key under a point of the keyboard. */
  pitchAt(x: number, y: number): number | undefined {
    for (const { face } of this.keys) {
      const inside =
        x >= face.x && x < face.x + face.width && y >= face.y && y < face.y + face.height;
      if (inside && face.pitch !== undefined) return face.pitch;
    }
    return undefined;
  }

  /** A key pressed with the mouse plays the real pitch of what it types, if it types anything. */
  pressWithMouse(column: number): void {
    if (this.mouseKey === column) return;
    this.releaseMouse();
    const pitch = this.computer?.press(column);
    if (pitch === undefined) return;
    this.mouseKey = column;
    this.onKeyPointer({ type: "down", pitch, velocity: 90 });
  }

  releaseMouse(): void {
    if (this.mouseKey === undefined) return;
    this.mouseKey = undefined;
    const pitch = this.computer?.release();
    if (pitch !== undefined) this.onKeyPointer({ type: "up", pitch, velocity: 0 });
  }

  /** A falling note's letter, light with a dark rim to read on its block, as the digits do. */
  letter(text: string): Texture {
    let texture = this.letters.get(text);
    if (!texture) {
      const label = new Text({
        text,
        style: {
          fontFamily: "'Russo One', Manrope, system-ui, sans-serif",
          fontSize: 32,
          fill: 0xffffff,
          stroke: { color: 0x00314f, width: 3 },
          dropShadow: { color: 0x00d9ff, blur: 7, distance: 0, alpha: 0.8 }
        },
        resolution: 2
      });
      texture = this.renderer.generateTexture({ target: label, resolution: 3 });
      label.destroy();
      this.letters.set(text, texture);
    }
    return texture;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onLeave);
    for (const texture of [
      ...Object.values(this.material),
      ...this.labelTextures,
      ...this.letters.values()
    ]) {
      texture.destroy(true);
    }
    this.labelTextures = [];
  }

  /** What each key shows, baked once per change of the inputs, the names or the layout. */
  private relabel(): void {
    for (const texture of this.labelTextures) texture.destroy(true);
    this.labelTextures = [];
    const language = this.computer?.language ?? "ru";
    for (const key of this.keys) {
      const { face } = key;
      const tokens =
        face.pitch === undefined ? [] : (this.computer?.byColumn.get(face.pitch) ?? []);
      const typing = typingFinger(face.code);
      key.assigned = tokens.length > 0;
      key.color = key.assigned && typing ? TYPING_FINGER_COLOR[typing.hand][typing.finger] : IDLE;
      const extras = tokens
        .map((token) => {
          const mark =
            token.input.modifier === "shift" ? "⇧" : token.input.modifier === "alt" ? "⌥" : "";
          return this.names ? `${mark}${pitchLabel(token.pitch)}` : mark;
        })
        .filter((part) => part !== "")
        .join(" ");
      const shifted =
        (language === "ru" ? SHIFTED_RU[face.code] : undefined) ??
        SHIFTED[language][face.code] ??
        SHIFTED_COMMON[face.code];
      const texture =
        face.caption !== undefined
          ? this.bakeLabel([{ text: face.caption, size: 18 }], face, 0.7)
          : this.bakeLabel(
              [
                ...(shifted ? [{ text: shifted, size: 18 }] : []),
                { text: keyDisplay(face.code, language).toUpperCase(), size: shifted ? 24 : 34 },
                ...(extras ? [{ text: extras, size: 15 }] : [])
              ],
              face,
              0.86
            );
      key.label.texture = texture;
    }
  }

  /** Lines of a caption, centred one under another, fitted to its key. */
  private bakeLabel(
    lines: readonly { readonly text: string; readonly size: number }[],
    face: KeyFace,
    fill: number
  ): Texture {
    // Each line in its own size, centred one under another, baked as one picture.
    const root = new Container();
    let top = 0;
    const texts = lines.map((line) => {
      const text = new Text({
        text: line.text,
        style: {
          fontFamily: "'Russo One', Manrope, system-ui, sans-serif",
          fontSize: line.size,
          fill: 0xffffff,
          // A soft halo round the letters: the key's tint colours it.
          dropShadow: { color: 0xffffff, blur: 6, distance: 0, alpha: 0.75 }
        },
        resolution: 2
      });
      text.y = top;
      top += line.size * 1.08;
      root.addChild(text);
      return text;
    });
    const widest = Math.max(...texts.map((text) => text.width));
    for (const text of texts) text.x = Math.round((widest - text.width) / 2);
    const texture = this.renderer.generateTexture({ target: root, resolution: 3 });
    root.destroy({ children: true });
    this.labelTextures.push(texture);
    const label = this.keys.find((key) => key.face === face)?.label;
    label?.scale.set(
      Math.min(1, (face.width * fill) / texture.width, (face.height * fill) / texture.height)
    );
    return texture;
  }

  private placeFelt(geometry: Geometry, total: number): void {
    this.felt.removeChildren().forEach((child) => {
      child.destroy();
    });
    const felt = new Sprite(Texture.WHITE);
    felt.tint = FELT;
    felt.y = geometry.keyboardTop - geometry.feltHeight;
    felt.width = total;
    felt.height = geometry.feltHeight;
    const edge = new Sprite(Texture.WHITE);
    edge.tint = FELT_EDGE;
    edge.y = felt.y;
    edge.width = total;
    edge.height = 1;
    this.felt.addChild(felt, edge);
  }
}

/** A nine-slice sprite of the key material whose corners stay round at every size. */
function slice(texture: Texture, margin: number): NineSliceSprite {
  const corner = RADIUS + 4 + margin;
  return new NineSliceSprite({
    texture,
    leftWidth: corner,
    rightWidth: corner,
    topHeight: corner,
    bottomHeight: corner
  });
}

/** Puts a material sprite over a box, its corners scaled with the key. */
function place(
  sprite: NineSliceSprite,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  margin = 0
): void {
  const s = scale > 0 ? scale : Math.max(0.01, height / REF);
  sprite.scale.set(s);
  sprite.position.set(x - margin * s, y - margin * s);
  sprite.setSize(width / s + margin * 2, height / s + margin * 2);
}

/** The key material, drawn once on canvases: a halo, a body, the glass over it and its edge. */
function bakeMaterial(): Record<"halo" | "base" | "glass" | "edge", Texture> {
  const draw = (size: number, paint: (context: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context) paint(context);
    return Texture.from(canvas);
  };
  const box = (context: CanvasRenderingContext2D, inset: number, offset = 0) => {
    context.beginPath();
    context.roundRect(offset + inset, offset + inset, REF - inset * 2, REF - inset * 2, RADIUS);
  };
  return {
    halo: draw(REF + HALO * 2, (context) => {
      context.shadowColor = "#ffffff";
      context.shadowBlur = HALO * 0.8;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 3;
      box(context, 1.5, HALO);
      context.stroke();
    }),
    base: draw(REF, (context) => {
      context.fillStyle = "#ffffff";
      box(context, 0);
      context.fill();
    }),
    glass: draw(REF, (context) => {
      const gradient = context.createLinearGradient(0, 0, 0, REF);
      // As the falling notes: a full, saturated core, a little lighter at the top.
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.5, "rgba(255,255,255,0.86)");
      gradient.addColorStop(1, "rgba(255,255,255,0.7)");
      context.fillStyle = gradient;
      box(context, 1);
      context.fill();
      // A thin light along the top, as glass catches it.
      context.strokeStyle = "rgba(255,255,255,0.35)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(RADIUS, 3.5);
      context.lineTo(REF - RADIUS, 3.5);
      context.stroke();
    }),
    edge: draw(REF, (context) => {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2.5;
      box(context, 1.25);
      context.stroke();
    })
  };
}
