import { Assets, Container, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import type { Renderer } from "pixi.js";

import type { Finger, Hand } from "../fingering/fingering";
import type { NoteStatus } from "../practice/session";
import { quartersAt } from "../song/song";
import type { Song, SongBeat, SongNote } from "../song/song";
import { nameKey } from "./bakeLabels";
import { FlatNoteBlocks } from "./FlatNoteBlocks";
import type { FallingNoteNames } from "./bakeLabels";
import { flatHoldBounds, holdBounds } from "./holdBounds";
import { repeatedNoteEnds, repeatGap } from "./noteSeparation";
import { scorePlacements } from "../song/scorePlacement";
import type { ScorePlacement } from "../song/scorePlacement";
import { FINGER_COLOR } from "./fingerColors";
import { fitNoteLabel, noteLabelInset } from "./noteLabelLayout";
import { GLASS_LIFT_SHARE } from "./RoadGlassLayer";
import type { KeyRect } from "./keyboardLayout";
import {
  CARD_FACE_OFFSET,
  CARD_GLOW,
  CARD_HEIGHT,
  CARD_WIDTH,
  TRAIL_TILE,
  bakeCardFace,
  bakeCardFrame,
  bakeCardGlow,
  bakeTrailTile
} from "./noteCards";
import { noteGlyph } from "./noteGlyph";
import { ARRIVAL_DURATION_S, arrivalCardAlpha, noteArrivalAge } from "./noteArrival";
import type { Arrival, RoadLayer } from "./RoadLayer";
import type { Geometry } from "./viewGeometry";

export const HAND_COLOR: Readonly<Record<Hand, number>> = { right: 0x00d9ff, left: 0xff9d00 };
const MISSED_COLOR = 0xff2454;
const OCTAVE_LINE = 0x008cff;
const HIT_LINE = 0x00e5ff;
const NOTE_GAP_PX = 1;
/** With cards on, the bar behind a card is a tail this share of its key wide. */
const TAIL_SHARE = 0.28;
/** On the road a note trails a glass lane this share of its key wide. */
const TRAIL_SHARE = 0.86;
/** Glass hold bars extend a little beyond their corresponding key. */
const ROAD_HOLD_WIDTH_SHARE = 1.08;
/*
 * The cards' neon, baked by Arcadia Effector (src/fx/card-neon.json): a
 * breathing, flickering tube with a halo round the card, 16 frames of 108×128
 * (the card and its glow margin) in 8×2, one loop in 1.2 s.
 */
const CARD_NEON = new URL("../fx/card-neon.webp", import.meta.url).href;
const CARD_NEON_FRAME = { width: 108, height: 128, cols: 8, count: 16, fps: 13.33 } as const;
/** The road's lanes: a faint line between keys and a bar at each measure start. */
const LANE_COLOR = 0x2f7bff;
const DOWNBEAT_ALPHA = 0.4;
/** A note card's width, in white-key widths, and its limits in pixels. */
const CARD_PER_WIDTH = 1.9;
const CARD_MIN_PX = 34;
const CARD_MAX_PX = 96;

interface NoteSprite {
  readonly note: SongNote;
  /** The bar, or on the road the trail: a tiled lane with a bar at every beat. */
  readonly body: TilingSprite;
  readonly placement: ScorePlacement | undefined;
  /** Seconds of one quarter within the note: the trail's beat. */
  readonly beatSeconds: number;
  /** The note written on a little staff, at the head of the body, glowing in its colour. */
  readonly glow: Sprite;
  readonly frame: Sprite;
  readonly face: Sprite;
  /** The finger, on the card. */
  readonly badge: Sprite;
  readonly digit: Sprite;
  readonly name: Sprite;
}

/** What the notes need of a frame: the time, the hands played, each note's status and colour. */
export interface NotesFrame {
  readonly time: number;
  readonly lookAhead: number;
  readonly statusOf: (noteId: string) => NoteStatus | undefined;
  readonly hands: ReadonlySet<Hand>;
  readonly hints?: boolean;
  readonly colorOf?: ((note: SongNote) => number | undefined) | undefined;
}

/** The labels baked once by the view, shared with the keyboard. */
export interface NoteLabels {
  readonly digits: ReadonlyMap<Finger, Texture>;
  /** Light digits for the cards' smoked glass. */
  readonly badges: ReadonlyMap<Finger, Texture>;
  readonly names: ReadonlyMap<string, Texture>;
}

/**
 * The falling notes: a bar a note, and on it either a card with the note
 * written on a staff and its finger, or the finger and the note's name. With
 * the lane's guides: a line at every C and the hit line.
 */
export class NotesLayer {
  /** The guides and the notes together: on the stage flat, or drawn into the road. */
  readonly root = new Container();
  /**
   * The note cards, over the lane on the stage in both views: flat they sit
   * where the notes are, on the road they stand upright where the notes land.
   */
  readonly cards = new Container({ sortableChildren: true });
  /** All notes crossing the hit line, including accompaniment, by pitch. */
  readonly playing = new Map<number, SongNote>();
  /** Notes coming over the road's horizon in the last frame drawn, with their flash. */
  readonly arrivals: Arrival[] = [];
  private readonly lane = new Container();
  private readonly guides = new Container();
  /** The road's lanes and measure bars, under the notes; flat, the plain guides do. */
  private readonly beatBars = new Container();
  private beats: readonly SongBeat[] = [];
  private laneWidth = 0;
  private notes: NoteSprite[] = [];
  private repeated: ReadonlySet<string> = new Set();
  private readonly cardFrame: Texture;
  /** The left hand's frame, with a second ring. */
  private readonly cardFrameLeft: Texture;
  private readonly cardGlow: Texture;
  /** The neon loop's frames; until they load, or if they cannot, the still glow stands in. */
  private neonFrames: Texture[] = [];
  private readonly trailTile: Texture;
  /** Card faces by pitch and written value, baked the first time a song needs one. */
  private readonly cardFaces = new Map<string, Texture>();
  private cardsOn = true;
  private readonly flatBlocks = new FlatNoteBlocks();
  private noteNames: FallingNoteNames | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly labels: NoteLabels
  ) {
    this.root.addChild(this.guides, this.beatBars, this.lane);
    this.cardFrame = bakeCardFrame(renderer);
    this.cardFrameLeft = bakeCardFrame(renderer, true);
    this.cardGlow = bakeCardGlow(renderer);
    this.trailTile = bakeTrailTile();
    this.flatBlocks.container.zIndex = -Infinity;
    this.cards.addChild(this.flatBlocks.container);
  }

  /** Shows or hides the notes, their cards and the guides. */
  setVisible(visible: boolean): void {
    this.lane.visible = visible;
    this.cards.visible = visible;
    this.guides.visible = visible;
  }

  /** Note names on the falling notes, over the finger; undefined hides them. */
  setNoteNames(style: FallingNoteNames | undefined): void {
    this.noteNames = style;
    for (const { note, name } of this.notes) name.texture = this.nameTexture(note.pitch);
  }

  /** Each falling note carries a card with the note written on a staff; off, plain bars. */
  setCards(on: boolean): void {
    this.cardsOn = on;
  }

  setSong(song: Song): void {
    this.beats = song.beats;
    this.repeated = repeatedNoteEnds(song.notes);
    const placements = scorePlacements(song);
    for (const sprite of this.notes) {
      sprite.body.destroy();
      sprite.digit.destroy();
      sprite.name.destroy();
      sprite.frame.destroy();
      sprite.face.destroy();
      sprite.glow.destroy();
      sprite.badge.destroy();
    }
    // Faces of the last song: baked per pitch, value and hand, they go with it.
    for (const texture of this.cardFaces.values()) texture.destroy(true);
    this.cardFaces.clear();
    this.notes = song.notes.map((note, order) => {
      const body = new TilingSprite({ texture: Texture.WHITE, width: 1, height: 1 });
      body.eventMode = "none";
      const placement = placements.get(note.id);
      const digit = new Sprite(note.finger ? this.labels.digits.get(note.finger) : undefined);
      digit.anchor.set(0.5, 1);
      digit.eventMode = "none";
      const name = new Sprite(this.nameTexture(note.pitch));
      name.anchor.set(0.5, 1);
      name.eventMode = "none";
      const frame = new Sprite(note.hand === "left" ? this.cardFrameLeft : this.cardFrame);
      frame.anchor.set(0.5, 1);
      frame.eventMode = "none";
      const quarters = quartersAt(song, note.start + note.duration) - note.startBeat;
      const glyph = noteGlyph(quarters);
      const beatSeconds = note.duration / Math.max(quarters, 0.25);
      const face = new Sprite(this.cardFace(note.pitch, glyph, note.hand, placement));
      face.anchor.set(0.5, 1);
      face.eventMode = "none";
      const badge = new Sprite(note.finger ? this.labels.badges.get(note.finger) : undefined);
      badge.anchor.set(0.5, 0);
      badge.eventMode = "none";
      // Nearer notes in front: on the road the earlier note is the closer one. By order in
      // the song, not by time, so a card's glow, frame, face and badge never mix with a
      // neighbour's, a chord's included.
      const glow = new Sprite(this.cardGlow);
      glow.anchor.set(0.5, 1);
      glow.eventMode = "none";
      glow.blendMode = "add";
      glow.zIndex = -order * 4;
      frame.zIndex = glow.zIndex + 1;
      face.zIndex = glow.zIndex + 2;
      badge.zIndex = glow.zIndex + 3;
      digit.zIndex = glow.zIndex + 2;
      name.zIndex = glow.zIndex + 3;
      this.lane.addChild(body);
      this.cards.addChild(glow, frame, face, badge, digit, name);
      return { note, body, placement, beatSeconds, glow, frame, face, badge, digit, name };
    });
  }

  /** The lane's guides for keys laid out `total` pixels wide, down to the hit line. */
  layout(keys: ReadonlyMap<number, KeyRect>, hitY: number, total: number): void {
    this.guides.removeChildren().forEach((child) => {
      child.destroy();
    });
    // Electric-blue lane guides, with a stronger edge at each octave.
    for (const [pitch, key] of keys) {
      const line = new Sprite(Texture.WHITE);
      line.tint = OCTAVE_LINE;
      line.alpha = pitch % 12 === 0 ? 0.5 : 0.18;
      line.x = key.x;
      line.width = 1;
      line.height = hitY;
      this.guides.addChild(line);
    }
    this.laneWidth = total;
    const hitLine = new Sprite(Texture.WHITE);
    hitLine.tint = HIT_LINE;
    hitLine.alpha = 1;
    hitLine.y = hitY - 1;
    hitLine.width = total;
    hitLine.height = 2;
    this.guides.addChild(hitLine);
  }

  /**
   * Places every note for this frame and fills `playing`. On the road (when
   * `road` is given) the cards stand where it projects the notes' landing.
   */
  draw(
    state: NotesFrame,
    keys: ReadonlyMap<number, KeyRect>,
    geometry: Geometry,
    road: RoadLayer | undefined
  ): void {
    const { hitY } = geometry;
    const pixelsPerSecond = hitY / state.lookAhead;
    const cards = this.cardsOn;
    road?.beginNotes();
    this.playing.clear();
    this.arrivals.length = 0;
    this.guides.visible = road === undefined && this.lane.visible;
    this.beatBars.visible = road !== undefined;
    if (road) this.drawBeats(state.time, state.lookAhead, hitY, pixelsPerSecond, road);
    const cardWidth = Math.min(
      CARD_MAX_PX,
      Math.max(CARD_MIN_PX, geometry.whiteWidth * CARD_PER_WIDTH)
    );
    const cardScale = cardWidth / CARD_WIDTH;
    // On the road the glass follows the note until its duration has elapsed.
    const trail = road !== undefined && cards;
    const flat = !cards && road === undefined;
    this.flatBlocks.begin();
    for (const { note, body, beatSeconds, glow, frame, face, badge, digit, name } of this.notes) {
      if (note.start <= state.time && state.time < note.start + note.duration) {
        const previous = this.playing.get(note.pitch);
        // At a shared pitch the player's fingering takes priority over accompaniment.
        if (!previous || state.hands.has(note.hand) || !state.hands.has(previous.hand)) {
          this.playing.set(note.pitch, note);
        }
      }
      const key = keys.get(note.pitch);
      const bottom = hitY - (note.start - state.time) * pixelsPerSecond;
      const noteHeight = Math.max(note.duration * pixelsPerSecond - NOTE_GAP_PX, 4);
      const onScreen = key !== undefined && bottom > 0 && bottom - noteHeight < hitY;
      // With cards the bar thins to a tail behind the card: the length still shows.
      const bounds = holdBounds(note.start, note.duration, state.time, state.lookAhead, hitY);
      const bodyBounds = flatHoldBounds(
        note.start,
        note.duration,
        state.time,
        state.lookAhead,
        hitY,
        NOTE_GAP_PX,
        4
      );
      if (onScreen && this.repeated.has(note.id) && bounds.top > 0) {
        const centre = key.x + key.width / 2;
        const spot = road?.notePlace(centre, bounds.top);
        const next = road?.notePlace(centre, bounds.top + 1);
        const slope = spot && next ? next.y - spot.y : 1;
        const gap = repeatGap(bounds.bottom - bounds.top, key.width, slope, spot?.scale ?? 1);
        bounds.top += gap;
        bodyBounds.top += Math.min(gap, Math.max(0, bodyBounds.bottom - bodyBounds.top) * 0.25);
      }
      const visibleHeight = Math.max(0, bodyBounds.bottom - bodyBounds.top);
      body.visible = onScreen && visibleHeight > 0;
      // A note taken bursts on its key and its card is gone; the key's own light carries on.
      const struck =
        state.statusOf(note.id) === "hit" ||
        (!state.hands.has(note.hand) && note.start <= state.time);
      frame.visible = onScreen && cards && !struck;
      face.visible = frame.visible;
      glow.visible = frame.visible;
      badge.visible = frame.visible && note.finger !== undefined && state.hints !== false;
      digit.visible =
        onScreen &&
        visibleHeight > 0 &&
        !cards &&
        note.finger !== undefined &&
        state.hints !== false;
      name.visible = false;
      if (!onScreen) continue;

      const playerNote = state.hands.has(note.hand);
      const status = state.statusOf(note.id);
      const barWidth = trail
        ? key.width * TRAIL_SHARE
        : cards
          ? key.width * TAIL_SHARE
          : key.width - NOTE_GAP_PX * 2;
      const keyCentre = key.x + key.width / 2;
      body.x = keyCentre - barWidth / 2;
      body.width = barWidth;
      // Consume duration at the hit line, including the flat view's extra room for hands.
      body.y = road?.beatY(bodyBounds.top) ?? bodyBounds.top;
      body.height = (road?.beatY(bodyBounds.bottom) ?? bodyBounds.bottom) - body.y;
      if (body.texture !== (trail ? this.trailTile : Texture.WHITE)) {
        body.texture = trail ? this.trailTile : Texture.WHITE;
        body.blendMode = trail ? "add" : "normal";
        if (!trail) body.tileScale.set(1);
      }
      if (trail) {
        const beatPx = Math.max(6, beatSeconds * pixelsPerSecond);
        body.tileScale.set(barWidth / TRAIL_TILE, beatPx / TRAIL_TILE);
        // A bar on the note's start, then one every beat back towards the horizon.
        body.tilePosition.set(0, noteHeight % beatPx);
      }
      const custom = state.colorOf?.(note);
      const own = note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand];
      body.tint = custom ?? (status === "missed" ? MISSED_COLOR : own);
      const cardAlpha = custom !== undefined ? 1 : !playerNote ? 0.45 : status === "hit" ? 0.3 : 1;
      body.alpha = road !== undefined ? 1 : cardAlpha;
      const age = noteArrivalAge(note.start, state.time, state.lookAhead);
      const arrivalAlpha = road?.arrivalEffectsReady ? arrivalCardAlpha(age) : 1;
      if (road && age >= 0 && age < ARRIVAL_DURATION_S) {
        this.arrivals.push({
          x: key.x + key.width / 2,
          width: key.width,
          color: note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand],
          age,
          screenX: road.notePlace(keyCentre, 0)?.x,
          screenY: road.notePlace(keyCentre, 0)?.y
        });
      }
      body.alpha *= arrivalAlpha;
      if (flat && visibleHeight > 0) {
        const neon = this.neonFrames;
        const texture =
          neon[Math.floor(state.time * CARD_NEON_FRAME.fps) % neon.length] ?? this.cardGlow;
        this.flatBlocks.draw(
          keyCentre,
          bodyBounds.top,
          key.width * 0.84,
          visibleHeight,
          body.tint,
          custom !== undefined ? 1 : !playerNote ? 0.82 : status === "hit" ? 0.75 : 1,
          texture
        );
        body.visible = false;
      }
      if (road && !flat && bounds.bottom > bounds.top) {
        if (
          road.drawHold(
            keyCentre,
            bounds.top,
            bounds.bottom,
            key.width * ROAD_HOLD_WIDTH_SHARE,
            body.tint,
            arrivalAlpha
          )
        )
          body.visible = false;
      }

      const lift = key.width * ROAD_HOLD_WIDTH_SHARE * GLASS_LIFT_SHARE;
      const labelSpot = !flat ? road?.notePlace(keyCentre, bounds.bottom, 0, lift) : undefined;
      const labelTopSpot = !flat ? road?.notePlace(keyCentre, bounds.top, 0, lift) : undefined;
      const labelBottom = labelSpot?.y ?? bodyBounds.bottom;
      const labelTop = labelTopSpot?.y ?? bodyBounds.top;
      const labelWidth =
        key.width * (flat ? 0.84 : ROAD_HOLD_WIDTH_SHARE) * (labelSpot?.scale ?? 1);
      const labelHeight = Math.max(0, labelBottom - labelTop);
      const inset = noteLabelInset(labelWidth, labelHeight);
      const labelX = labelSpot?.x ?? keyCentre - (road?.scenePan ?? 0);
      if (note.finger !== undefined) {
        digit.texture =
          (road || flat ? this.labels.badges : this.labels.digits).get(note.finger) ??
          Texture.EMPTY;
      }
      const digitScale = fitNoteLabel(
        labelWidth - inset * 2,
        labelHeight - inset * 2,
        digit.texture.width,
        digit.texture.height,
        24
      );
      digit.scale.set(digitScale);
      digit.visible = digit.visible && digitScale > 0;
      digit.anchor.set(0.5, 1);
      digit.x = labelX;
      digit.y = labelBottom - inset;
      digit.alpha = body.alpha;
      if (cards) {
        // The card stands where the note lands; on the road it faces the player and
        // grows as it comes nearer.
        const centre = key.x + key.width / 2;
        // A sounding note's card waits on the hit line rather than sliding over the keys.
        const landing = Math.min(bottom, hitY);
        const spot = road?.notePlace(centre, landing);
        // Far up the road a card is still in the fog; it clears as it nears.
        const seen = cardAlpha * arrivalAlpha * (road ? road.clarity(landing) : 1);
        const scale = cardScale * (spot?.scale ?? 1);
        const x = spot?.x ?? centre;
        const y = spot?.y ?? landing;
        glow.scale.set(scale);
        glow.position.set(x, y + CARD_GLOW * scale);
        glow.tint = body.tint;
        // A neon tube flickers a little, each card on its own beat.
        glow.alpha = seen;
        // Each card on its own step of the neon's loop, so cards never flicker in step.
        const neon = this.neonFrames;
        if (neon.length > 0) {
          const step = Math.floor((performance.now() / 1000) * CARD_NEON_FRAME.fps);
          glow.texture =
            neon[(step + Math.round(note.startBeat * 5)) % neon.length] ?? glow.texture;
        }
        frame.scale.set(scale);
        frame.position.set(x, y);
        // The tube itself burns near white, only touched by the finger's colour.
        frame.tint = towardWhite(body.tint, 0.55);
        frame.alpha = seen;
        face.scale.set(scale);
        face.position.set(x, y - CARD_FACE_OFFSET * scale);
        face.alpha = seen;
        // The note and its staff in the finger's colour, the note bright over the dim lines.
        face.tint = body.tint;
        badge.scale.set(scale * 0.55);
        badge.position.set(x, y - (CARD_HEIGHT - CARD_FACE_OFFSET - 1) * scale);
        badge.alpha = seen;
        continue;
      }
      if (this.noteNames) {
        // Over the finger, when the note is tall enough to hold both.
        const digitHeight = digit.visible ? digit.height + 2 : 0;
        const nameScale = fitNoteLabel(
          labelWidth - inset * 2,
          labelHeight - inset * 2 - digitHeight,
          name.texture.width,
          name.texture.height,
          16
        );
        name.scale.set(nameScale);
        name.visible = nameScale > 0;
        name.anchor.set(0.5, 1);
        name.x = labelX;
        name.y = labelBottom - inset - digitHeight;
        name.alpha = body.alpha;
      }
    }
    this.flatBlocks.end();
    road?.endNotes();
  }

  /** A bar across the road at each visible measure start; bars are reused. */
  private drawBeats(
    time: number,
    lookAhead: number,
    hitY: number,
    pixelsPerSecond: number,
    road: RoadLayer
  ): void {
    let used = 0;
    for (const beat of this.beats) {
      if (beat.time < time) continue;
      if (beat.time > time + lookAhead) break;
      if (!beat.downbeat) continue;
      let bar = this.beatBars.children[used] as Sprite | undefined;
      if (!bar) {
        bar = new Sprite(Texture.WHITE);
        bar.tint = LANE_COLOR;
        this.beatBars.addChild(bar);
      }
      bar.visible = true;
      bar.alpha = DOWNBEAT_ALPHA;
      bar.width = this.laneWidth;
      bar.height = 2;
      bar.y = road.beatY(hitY - (beat.time - time) * pixelsPerSecond);
      used++;
    }
    for (let index = used; index < this.beatBars.children.length; index++) {
      const bar = this.beatBars.children[index];
      if (bar) bar.visible = false;
    }
  }

  /** Loads the cards' neon loop; a failure leaves them their still glow. */
  async loadNeon(): Promise<void> {
    try {
      const atlas = await Assets.load<Texture>(CARD_NEON);
      const { width, height, cols, count } = CARD_NEON_FRAME;
      this.neonFrames = Array.from(
        { length: count },
        (_, index) =>
          new Texture({
            source: atlas.source,
            frame: new Rectangle(
              (index % cols) * width,
              Math.floor(index / cols) * height,
              width,
              height
            )
          })
      );
    } catch (error) {
      console.warn("The cards' neon did not load; they keep a still glow", error);
    }
  }

  /** Frees the textures the notes baked for themselves; the shared labels are the view's. */
  destroy(): void {
    this.flatBlocks.destroy();
    for (const texture of this.cardFaces.values()) texture.destroy(true);
    for (const texture of [this.cardFrame, this.cardFrameLeft, this.cardGlow, this.trailTile]) {
      if (texture !== Texture.WHITE) texture.destroy(true);
    }
  }

  private nameTexture(pitch: number): Texture {
    const style = this.noteNames;
    return style ? (this.labels.names.get(nameKey(style, pitch)) ?? Texture.EMPTY) : Texture.EMPTY;
  }

  private cardFace(
    pitch: number,
    glyph: ReturnType<typeof noteGlyph>,
    hand: Hand,
    placement?: ScorePlacement
  ): Texture {
    const key = `${String(pitch)}:${glyph.kind}:${String(glyph.dotted)}:${hand}:${placement?.clef ?? ""}:${String(placement?.position)}:${placement?.accidental ?? ""}`;
    let texture = this.cardFaces.get(key);
    if (!texture) {
      const clef = placement?.clef ?? (hand === "left" ? "bass" : "treble");
      texture = bakeCardFace(this.renderer, pitch, glyph, clef, placement);
      this.cardFaces.set(key, texture);
    }
    return texture;
  }
}

/** A colour `share` of the way to white. */
function towardWhite(color: number, share: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    return Math.round(value + (255 - value) * share) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}
