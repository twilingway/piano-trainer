import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";

import { pitchLabel } from "../input/keyboardLayouts";
import type { KeyEvent } from "../input/midiInput";
import { typingFinger } from "../wordTyping/touchTyping";
import type { GeneratedToken } from "../wordTyping/types";
import type { ComputerKeys } from "./computerKeys";
import { layoutComputerKeys } from "./computerKeyboardLayout";
import type { KeyFace } from "./computerKeyboardLayout";
import { TYPING_FINGER_COLOR } from "./fingerColors";
import type { KeyboardLayer, KeysFrame } from "./KeyboardLayer";
import type { Geometry } from "./viewGeometry";

/** A key without an input, and the colour of a lit key's label. */
const EMPTY_COLOR = 0x1b3550;
const DARK = 0x020c18;
/** The felt over the keys and its neon edge, as over the piano's. */
const FELT = 0x003b62;
const FELT_EDGE = 0x00e5ff;
/** How strongly a key's face takes its finger's colour: at rest, next, owed, held. */
const FACE_ALPHA = { idle: 0.2, next: 0.5, due: 0.92, pressed: 1 } as const;
/** A held key sinks this share of its height. */
const SINK_SHARE = 0.05;

type KeyState = keyof typeof FACE_ALPHA;

/** What the view asks of a keyboard, the piano's or the computer's. */
export type KeysLayer = Pick<
  KeyboardLayer,
  "container" | "layout" | "draw" | "pitchAt" | "pressWithMouse" | "releaseMouse" | "showFelt"
>;

interface KeySprites {
  readonly face: KeyFace;
  readonly fill: Sprite;
  readonly edge: Sprite;
  readonly glow: Sprite;
  readonly label: Sprite;
  color: number;
  assigned: boolean;
}

/**
 * The word mode's keyboard: the computer keys in their rows, each in its touch-typing finger's
 * colour with what it types and plays, the owed key lit, the next one dimmer, a held one sunk.
 * It stands where the piano's keyboard does and answers the view the same way.
 */
export class ComputerKeyboardLayer implements KeysLayer {
  readonly container = new Container();
  private readonly keysLayer = new Container();
  private readonly felt = new Container();
  private keys: KeySprites[] = [];
  private fillTexture: Texture | undefined;
  private edgeTexture: Texture | undefined;
  private labelTextures: Texture[] = [];
  private computer: ComputerKeys | undefined;
  /** Note names under the letters, like the piano keys' stickers. */
  private names = false;
  private mouseKey: number | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly onKeyPointer: (event: KeyEvent) => void
  ) {
    this.container.addChild(this.felt, this.keysLayer);
  }

  /** The inputs to show, or none: every key then stands empty. */
  setKeys(computer: ComputerKeys | undefined): void {
    this.computer = computer;
    this.relabel();
  }

  showFelt(show: boolean): void {
    this.felt.visible = show;
  }

  showStickers(show: boolean): void {
    if (show === this.names) return;
    this.names = show;
    this.relabel();
  }

  /** Lays the keys in their rows `total` pixels wide where `geometry` puts the keyboard. */
  layout(_keys: unknown, geometry: Geometry, total: number): void {
    const { faces } = layoutComputerKeys(total, geometry);
    for (const key of this.keys) {
      for (const sprite of [key.fill, key.edge, key.glow, key.label]) sprite.destroy();
    }
    this.keys = [];
    this.fillTexture?.destroy(true);
    this.edgeTexture?.destroy(true);
    const sample = faces[0];
    if (!sample || sample.width < 2 || sample.height < 2) return;
    const radius = Math.min(sample.width, sample.height) * 0.14;
    this.fillTexture = this.bake(
      new Graphics().roundRect(0, 0, sample.width, sample.height, radius).fill(0xffffff)
    );
    this.edgeTexture = this.bake(
      new Graphics()
        .roundRect(1, 1, sample.width - 2, sample.height - 2, radius)
        .stroke({ width: 1.5, color: 0xffffff })
    );
    for (const face of faces) {
      const fill = new Sprite(this.fillTexture);
      const edge = new Sprite(this.edgeTexture);
      const glow = new Sprite(this.fillTexture);
      const label = new Sprite();
      glow.anchor.set(0.5);
      glow.blendMode = "add";
      label.anchor.set(0.5);
      for (const sprite of [edge, glow, label]) sprite.eventMode = "none";
      fill.eventMode = "static";
      fill.cursor = "pointer";
      fill.on("pointerdown", () => {
        this.pressWithMouse(face.pitch);
      });
      fill.on("pointerup", () => {
        this.releaseMouse();
      });
      fill.on("pointerupoutside", () => {
        this.releaseMouse();
      });
      this.keysLayer.addChild(glow, fill, edge, label);
      this.keys.push({ face, fill, edge, glow, label, color: EMPTY_COLOR, assigned: false });
    }
    this.placeFelt(geometry, total);
    this.relabel();
  }

  /** Lights the keys for this frame: the owed key, the next one, the held ones. */
  draw(frame: KeysFrame): void {
    const hints = frame.hints !== false;
    const next = hints ? this.computer?.next()?.pitch : undefined;
    for (const key of this.keys) {
      const { face, fill, edge, glow, label } = key;
      const pitch = face.pitch;
      const state: KeyState = frame.pressed.has(pitch)
        ? "pressed"
        : hints && frame.due.some((note) => note.pitch === pitch)
          ? "due"
          : pitch === next
            ? "next"
            : "idle";
      const lit = key.assigned && (state === "due" || state === "pressed");
      const sink = state === "pressed" ? face.height * SINK_SHARE : 0;
      fill.position.set(face.x, face.y + sink);
      edge.position.set(face.x, face.y + sink);
      label.position.set(face.x + face.width / 2, face.y + face.height / 2 + sink);
      fill.tint = key.color;
      fill.alpha = key.assigned ? FACE_ALPHA[state] : 0.3;
      edge.tint = key.color;
      edge.alpha = key.assigned ? 0.9 : 0.35;
      glow.visible = lit;
      glow.tint = key.color;
      glow.alpha = 0.45;
      glow.position.set(face.x + face.width / 2, face.y + face.height / 2 + sink);
      glow.scale.set(1.18);
      label.tint = lit ? DARK : key.color;
    }
  }

  /** The key under a point of the keyboard. */
  pitchAt(x: number, y: number): number | undefined {
    for (const { face } of this.keys) {
      const inside =
        x >= face.x && x < face.x + face.width && y >= face.y && y < face.y + face.height;
      if (inside) return face.pitch;
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

  destroy(): void {
    for (const texture of [this.fillTexture, this.edgeTexture, ...this.labelTextures]) {
      texture?.destroy(true);
    }
  }

  /** What each key types and plays, baked once per change of the inputs or the names. */
  private relabel(): void {
    for (const texture of this.labelTextures) texture.destroy(true);
    this.labelTextures = [];
    for (const key of this.keys) {
      const tokens = this.computer?.byColumn.get(key.face.pitch) ?? [];
      const typing = typingFinger(key.face.code);
      key.assigned = tokens.length > 0;
      key.color =
        key.assigned && typing ? TYPING_FINGER_COLOR[typing.hand][typing.finger] : EMPTY_COLOR;
      key.label.texture = key.assigned ? this.bakeLabel(tokens, key.face) : Texture.EMPTY;
    }
  }

  private bakeLabel(tokens: readonly GeneratedToken[], face: KeyFace): Texture {
    const letters = tokens
      .map((token) =>
        token.input.display
          .replace(/^Shift\+/, "⇧")
          .replace(/^Alt\+/, "⌥")
          .toUpperCase()
      )
      .join(" ");
    const names = tokens.map((token) => pitchLabel(token.pitch)).join(" ");
    const text = new Text({
      text: this.names ? `${letters}\n${names}` : letters,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 26,
        fontWeight: "700",
        fill: 0xffffff,
        align: "center",
        lineHeight: 28
      },
      resolution: 2
    });
    const texture = this.bake(text);
    this.labelTextures.push(texture);
    // The label sprite keeps within its key.
    const label = this.keys.find((key) => key.face === face)?.label;
    label?.scale.set(
      Math.min(1, (face.width * 0.86) / texture.width, (face.height * 0.8) / texture.height)
    );
    return texture;
  }

  private bake(target: Graphics | Text): Texture {
    const texture = this.renderer.generateTexture({ target, resolution: 2 });
    target.destroy();
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
