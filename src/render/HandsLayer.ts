import { Assets, Container, PerspectiveMesh, Sprite, Texture } from "pixi.js";

import type { Finger, Hand } from "../fingering/fingering";
import type { Song, SongNote } from "../song/song";
import { FINGER_COLOR } from "./fingerColors";
import { HAND_RENDERS, handPoseSet } from "./handRenderCatalog";
import type { HandStyle } from "./handRenderCatalog";
import { HAND_SPRITES } from "./handSpriteCatalog";
import type { HandSpriteDefinition } from "./handSpriteCatalog";
import { fitPose } from "./handSprites";
import { blendPose, chordGlide, easePose, handPose, handHintChord } from "./handPose";
import type { HandPose, Tip } from "./handPose";
import { APPROACH_MS } from "./keyFeedback";
import type { KeyRect } from "./keyboardLayout";

export interface HandsGeometry {
  readonly keyboardTop: number;
  readonly keyboardHeight: number;
  readonly blackHeight: number;
  readonly whiteWidth: number;
}
export type HandProject = (x: number, y: number, reach?: number) => { x: number; y: number };

const HANDS: readonly Hand[] = ["left", "right"];
const HAND_ALPHA = 0.58;
// Eases only what the glide between chords leaves: a seek, a mode change.
const MOVE_SMOOTHING_S = 0.05;
const CHANGE_S = 0.18;
const PULSE_HZ = 2.5;
const TIP_RADIUS = 0.22;
const CHORD_DROP_KEYS = 0.5;

interface Picture {
  readonly mesh: PerspectiveMesh;
  definition?: HandSpriteDefinition;
  x: number;
  y: number;
}
interface Visual {
  readonly pictures: readonly [Picture, Picture];
  readonly markers: ReadonlyMap<Finger, Sprite>;
  front: 0 | 1;
  blend: number;
}

/** Whole baked hand poses, with precise fingertip hints independently projected onto the keys. */
export class HandsLayer {
  readonly container = new Container({ eventMode: "none" });
  private readonly visuals = new Map<Hand, Visual>();
  private readonly textures = new Map<HandSpriteDefinition, Texture>();
  private readonly available: HandSpriteDefinition[] = [];
  /** The 3D renders loaded so far; fetched only once the 3D style is chosen. */
  private readonly renders: HandSpriteDefinition[] = [];
  private rendersRequested = false;
  private style: HandStyle = "drawn";
  private readonly markerTexture = bakeMarker();
  private readonly poses = new Map<Hand, HandPose>();
  private notes: Record<Hand, SongNote[]> = { left: [], right: [] };
  private disposed = false;

  constructor() {
    const markersRoot = new Container({ eventMode: "none" });
    for (const hand of HANDS) {
      const pictures = [0, 1].map((): Picture => {
        const mesh = new PerspectiveMesh({ texture: Texture.WHITE, verticesX: 8, verticesY: 16 });
        mesh.eventMode = "none";
        mesh.visible = false;
        this.container.addChild(mesh);
        return { mesh, x: 0, y: 0 };
      }) as [Picture, Picture];
      const markers = new Map<Finger, Sprite>();
      for (const finger of [1, 2, 3, 4, 5] as const) {
        const marker = new Sprite(this.markerTexture);
        marker.anchor.set(0.5);
        marker.tint = FINGER_COLOR[finger];
        marker.eventMode = "none";
        marker.visible = false;
        markersRoot.addChild(marker);
        markers.set(finger, marker);
      }
      this.visuals.set(hand, { pictures, markers, front: 0, blend: 1 });
    }
    this.container.addChild(markersRoot);
  }

  async load(): Promise<void> {
    await Promise.all(
      HAND_SPRITES.map(async (definition) => {
        try {
          const original = await Assets.load<Texture>(definition.url);
          if (!this.disposed) {
            this.textures.set(definition, fadeWrist(original));
          }
        } catch (error) {
          console.warn(`Hand pose ${definition.id} did not load; using remaining poses`, error);
        }
      })
    );
    if (!this.disposed)
      this.available.push(...HAND_SPRITES.filter((pose) => this.textures.has(pose)));
  }

  /** Switches the look of the hands; the 3D renders start loading the first time they are asked for. */
  setStyle(style: HandStyle): void {
    if (style === this.style) return;
    this.style = style;
    // The two sets differ in scale: no cross-fade from one into the other.
    this.reset();
    if (style === "rendered" && !this.rendersRequested) {
      this.rendersRequested = true;
      void this.loadRenders();
    }
  }

  private async loadRenders(): Promise<void> {
    await Promise.all(
      HAND_RENDERS.map(async (definition) => {
        try {
          // The wrist fade is baked into the renders.
          const texture = await Assets.load<Texture>(definition.url);
          if (this.disposed) return;
          this.textures.set(definition, texture);
          this.renders.push(definition);
        } catch (error) {
          console.warn(`Hand render ${definition.id} did not load; using remaining poses`, error);
        }
      })
    );
  }

  setSong(song: Song): void {
    this.notes = {
      left: song.notes.filter((note) => note.hand === "left"),
      right: song.notes.filter((note) => note.hand === "right")
    };
    this.reset();
  }

  reset(): void {
    this.poses.clear();
    for (const visual of this.visuals.values()) {
      for (const picture of visual.pictures) {
        picture.mesh.visible = false;
        delete picture.definition;
      }
      for (const marker of visual.markers.values()) marker.visible = false;
      visual.blend = 1;
    }
  }

  draw(
    time: number,
    deltaSeconds: number,
    hands: ReadonlySet<Hand>,
    keys: ReadonlyMap<number, KeyRect>,
    geometry: HandsGeometry,
    project: HandProject,
    waitingFor: readonly SongNote[] = [],
    speed = 1
  ): void {
    const { poses: available, exactPressed } = handPoseSet(
      this.style,
      this.available,
      this.renders
    );
    // The hand sets off at the latest as the next key starts to light, in song seconds.
    const lead = (APPROACH_MS / 1000) * speed;
    for (const hand of HANDS) {
      const visual = this.visuals.get(hand);
      if (!visual) continue;
      // Listening, no hand is the player's: both show how the program plays.
      if (hands.size > 0 && !hands.has(hand)) {
        this.poses.delete(hand);
        for (const picture of visual.pictures) picture.mesh.visible = false;
        for (const marker of visual.markers.values()) marker.visible = false;
        continue;
      }
      const pending = waitingFor.filter((note) => note.hand === hand);
      const waiting = waitingFor.length > 0;
      // Playing on, the hand glides to the next chord once it is free.
      const glide = waiting ? undefined : chordGlide(this.notes[hand], time, lead);
      const chord = glide ? glide.to : handHintChord(this.notes[hand], time, pending, waiting);
      const previous = this.poses.get(hand);
      const target = handPose(hand, chord?.notes ?? [], keys, previous);
      if (!target) continue;
      const origin =
        glide && glide.progress < 1 ? handPose(hand, glide.from.notes, keys, previous) : undefined;
      const aim = origin && glide ? blendPose(origin, target, glide.progress) : target;
      const pose = easePose(previous, aim, deltaSeconds, MOVE_SMOOTHING_S);
      this.poses.set(hand, pose);
      const targets = new Map([...aim.down].map((finger) => [finger, aim.tips[finger].x]));
      const fit = fitPose(available, hand, targets, geometry.whiteWidth, 1, exactPressed);
      const chosen = fit && available.find((definition) => definition === fit.pose);
      if (
        fit &&
        chosen &&
        visual.blend >= 1 &&
        visual.pictures[visual.front].definition !== chosen
      ) {
        const hadPicture = visual.pictures[visual.front].definition !== undefined;
        visual.front = visual.front === 0 ? 1 : 0;
        const picture = visual.pictures[visual.front];
        picture.definition = chosen;
        picture.mesh.texture = this.textures.get(chosen) ?? Texture.WHITE;
        picture.x = fit.x;
        picture.y = fitY(picture.definition, aim, geometry, fit.scaleY);
        visual.blend = hadPicture ? 0 : 1;
      }
      visual.blend = Math.min(1, visual.blend + deltaSeconds / CHANGE_S);
      for (let index = 0; index < visual.pictures.length; index++) {
        const picture = visual.pictures[index];
        if (!picture?.definition) continue;
        const opacity = index === visual.front ? visual.blend : 1 - visual.blend;
        picture.mesh.visible = opacity > 0;
        if (!picture.mesh.visible) continue;
        picture.mesh.alpha = opacity * HAND_ALPHA;
        const placed = fitPose([picture.definition], hand, targets, geometry.whiteWidth, 1);
        const scale = geometry.whiteWidth / picture.definition.pixelsPerKey;
        if (placed) {
          const share = 1 - Math.exp(-deltaSeconds / MOVE_SMOOTHING_S);
          picture.x += (placed.x - picture.x) * share;
          picture.y += (fitY(picture.definition, aim, geometry, scale) - picture.y) * share;
        }
        const w = picture.mesh.texture.width * scale * (hand === "right" ? 1 : -1);
        const h = picture.mesh.texture.height * scale;
        const a = project(picture.x, picture.y);
        const b = project(picture.x + w, picture.y);
        const c = project(picture.x + w, picture.y + h);
        const d = project(picture.x, picture.y + h);
        picture.mesh.setCorners(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
      }
      // A released chord the hand still rests on is not pressed any more.
      const pressing =
        chord !== undefined &&
        chord.start <= time &&
        (waiting || chord.notes.some((note) => time < note.start + note.duration));
      const pulse = 0.65 + 0.35 * Math.sin(time * Math.PI * 2 * PULSE_HZ);
      for (const [finger, marker] of visual.markers) {
        marker.visible =
          pending.length > 0
            ? pending.some((note) => note.finger === finger)
            : target.down.has(finger);
        if (!marker.visible) continue;
        // Hints sit on the owed keys even while the whole hand is still moving there.
        const tip = { x: target.tips[finger].x, reach: pose.tips[finger].reach };
        const y = tipY(tip, geometry);
        const spot = project(tip.x, y, tip.reach);
        const edge = project(tip.x + geometry.whiteWidth * TIP_RADIUS, y, tip.reach);
        const radius = Math.max(2, Math.hypot(edge.x - spot.x, edge.y - spot.y));
        marker.position.set(spot.x, spot.y);
        marker.width = radius * 2;
        marker.height = radius * 2;
        marker.alpha = pressing ? 1 : pulse;
      }
    }
  }

  destroy(): void {
    this.disposed = true;
    // The baked drawn poses are this layer's own; the renders belong to the Assets cache.
    for (const [definition, texture] of this.textures) {
      if (!this.renders.includes(definition)) texture.destroy(true);
    }
    if (this.renders.length > 0) void Assets.unload(this.renders.map((pose) => pose.url));
    this.textures.clear();
    this.markerTexture.destroy(true);
  }
}

function tipY(tip: Tip, geometry: HandsGeometry): number {
  const { keyboardTop, keyboardHeight, blackHeight } = geometry;
  const white = keyboardTop + blackHeight + (keyboardHeight - blackHeight) * 0.45;
  const black = keyboardTop + blackHeight * 0.72;
  return white + (black - white) * tip.reach;
}

function fitY(
  definition: HandSpriteDefinition | undefined,
  pose: HandPose,
  geometry: HandsGeometry,
  scale: number
): number {
  if (!definition || pose.down.size === 0) return geometry.keyboardTop;
  // The frontmost active pad anchors the whole hand; averaging would put a short thumb off the keys.
  let anchor: Finger | undefined;
  for (const finger of pose.down) {
    if (anchor === undefined || definition.tips[finger].y > definition.tips[anchor].y)
      anchor = finger;
  }
  return anchor === undefined
    ? geometry.keyboardTop
    : tipY(pose.tips[anchor], geometry) -
        definition.tips[anchor].y * scale +
        (pose.down.size > 1 ? geometry.whiteWidth * CHORD_DROP_KEYS : 0);
}

/** Static wrist fade is baked once, so no mask/filter is evaluated every frame. */
function fadeWrist(original: Texture): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = original.width;
  canvas.height = original.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot bake hand wrist fade");
  context.drawImage(original.source.resource as CanvasImageSource, 0, 0);
  context.globalCompositeOperation = "destination-in";
  const fade = context.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
  fade.addColorStop(0, "white");
  fade.addColorStop(1, "transparent");
  context.fillStyle = fade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return Texture.from(canvas);
}

function bakeMarker(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot bake finger marker");
  const glow = context.createRadialGradient(24, 24, 0, 24, 24, 24);
  glow.addColorStop(0, "white");
  glow.addColorStop(0.4, "white");
  glow.addColorStop(1, "transparent");
  context.fillStyle = glow;
  context.fillRect(0, 0, 48, 48);
  return Texture.from(canvas);
}
