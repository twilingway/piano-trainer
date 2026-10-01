import { Container, Sprite, Texture, TilingSprite } from "pixi.js";
import type { Renderer } from "pixi.js";

import type { Finger, Hand } from "../fingering/fingering";
import type { NoteStatus } from "../practice/session";
import { quartersAt } from "../song/song";
import type { Song, SongNote } from "../song/song";
import { nameKey } from "./bakeLabels";
import type { FallingNoteNames } from "./bakeLabels";
import { FINGER_COLOR } from "./fingerColors";
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
import type { Arrival, RoadLayer } from "./RoadLayer";
import type { Geometry } from "./viewGeometry";

export const HAND_COLOR: Readonly<Record<Hand, number>> = { right: 0x4cc9f0, left: 0xf4a261 };
const MISSED_COLOR = 0xe63946;
const OCTAVE_LINE = 0x2a2f3d;
const HIT_LINE = 0xffffff;
const NOTE_GAP_PX = 1;
/** With cards on, the bar behind a card is a tail this share of its key wide. */
const TAIL_SHARE = 0.28;
/** On the road a note trails a lane this share of its key wide, marked at every beat. */
const TRAIL_SHARE = 0.86;
/** A note flashes on the horizon for this share of the lane after it comes over. */
const ARRIVAL_SHARE = 0.08;
/** A note card's width, in white-key widths, and its limits in pixels. */
const CARD_PER_WIDTH = 1.9;
const CARD_MIN_PX = 34;
const CARD_MAX_PX = 96;

interface NoteSprite {
  readonly note: SongNote;
  /** The bar, or on the road the trail: a tiled lane with a bar at every beat. */
  readonly body: TilingSprite;
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
  /** Notes crossing the hit line in the last frame drawn, by pitch. */
  readonly playing = new Map<number, SongNote>();
  /** Notes coming over the road's horizon in the last frame drawn, with their flash. */
  readonly arrivals: Arrival[] = [];
  private readonly lane = new Container();
  private readonly guides = new Container();
  private notes: NoteSprite[] = [];
  private readonly cardFrame: Texture;
  /** The left hand's frame, with a second ring. */
  private readonly cardFrameLeft: Texture;
  private readonly cardGlow: Texture;
  private readonly trailTile: Texture;
  /** Card faces by pitch and written value, baked the first time a song needs one. */
  private readonly cardFaces = new Map<string, Texture>();
  private cardsOn = true;
  private noteNames: FallingNoteNames | undefined;

  constructor(
    private readonly renderer: Renderer,
    private readonly labels: NoteLabels,
    private readonly onNoteClick: (noteId: string) => void
  ) {
    this.root.addChild(this.guides, this.lane);
    this.cardFrame = bakeCardFrame(renderer);
    this.cardFrameLeft = bakeCardFrame(renderer, true);
    this.cardGlow = bakeCardGlow(renderer);
    this.trailTile = bakeTrailTile();
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
      body.eventMode = "static";
      body.cursor = "pointer";
      body.on("pointertap", () => {
        this.onNoteClick(note.id);
      });
      const digit = new Sprite(note.finger ? this.labels.digits.get(note.finger) : undefined);
      digit.anchor.set(0.5, 1);
      digit.eventMode = "none";
      const name = new Sprite(this.nameTexture(note.pitch));
      name.anchor.set(0.5, 1);
      name.eventMode = "none";
      const frame = new Sprite(note.hand === "left" ? this.cardFrameLeft : this.cardFrame);
      frame.anchor.set(0.5, 1);
      frame.eventMode = "static";
      frame.cursor = "pointer";
      frame.on("pointertap", () => {
        this.onNoteClick(note.id);
      });
      const quarters = quartersAt(song, note.start + note.duration) - note.startBeat;
      const glyph = noteGlyph(quarters);
      const beatSeconds = note.duration / Math.max(quarters, 0.25);
      const face = new Sprite(this.cardFace(note.pitch, glyph, note.hand));
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
      this.lane.addChild(body, digit, name);
      this.cards.addChild(glow, frame, face, badge);
      return { note, body, beatSeconds, glow, frame, face, badge, digit, name };
    });
  }

  /** The lane's guides for keys laid out `total` pixels wide, down to the hit line. */
  layout(keys: ReadonlyMap<number, KeyRect>, hitY: number, total: number): void {
    this.guides.removeChildren().forEach((child) => {
      child.destroy();
    });
    // A faint line at every C, so the eye finds octaves on the way down.
    for (const [pitch, key] of keys) {
      if (pitch % 12 !== 0) continue;
      const line = new Sprite(Texture.WHITE);
      line.tint = OCTAVE_LINE;
      line.x = key.x;
      line.width = 1;
      line.height = hitY;
      this.guides.addChild(line);
    }
    const hitLine = new Sprite(Texture.WHITE);
    hitLine.tint = HIT_LINE;
    hitLine.alpha = 0.5;
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
    this.playing.clear();
    this.arrivals.length = 0;
    const cardWidth = Math.min(
      CARD_MAX_PX,
      Math.max(CARD_MIN_PX, geometry.whiteWidth * CARD_PER_WIDTH)
    );
    const cardScale = cardWidth / CARD_WIDTH;
    // On the road a note trails a lane of beats behind its card, as in the mockup.
    const trail = road !== undefined && cards;
    for (const { note, body, beatSeconds, glow, frame, face, badge, digit, name } of this.notes) {
      if (note.start <= state.time && state.time < note.start + note.duration) {
        this.playing.set(note.pitch, note);
      }
      const key = keys.get(note.pitch);
      const bottom = hitY - (note.start - state.time) * pixelsPerSecond;
      const noteHeight = Math.max(note.duration * pixelsPerSecond - NOTE_GAP_PX, 4);
      const onScreen = key !== undefined && bottom > 0 && bottom - noteHeight < hitY;
      // With cards the bar thins to a tail behind the card: the length still shows.
      body.visible = onScreen;
      frame.visible = onScreen && cards;
      face.visible = frame.visible;
      glow.visible = frame.visible;
      badge.visible = frame.visible && note.finger !== undefined;
      digit.visible = onScreen && !cards && note.finger !== undefined;
      name.visible = false;
      if (!onScreen) continue;

      const playerNote = state.hands.has(note.hand);
      const status = state.statusOf(note.id);
      const barWidth = trail
        ? key.width * TRAIL_SHARE
        : cards
          ? key.width * TAIL_SHARE
          : key.width - NOTE_GAP_PX * 2;
      body.x = key.x + (key.width - barWidth) / 2;
      body.width = barWidth;
      // The tail runs the note's whole length, so lengths compare; the card's glass covers
      // its head.
      body.y = bottom - noteHeight;
      body.height = noteHeight;
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
      const own =
        road && note.finger !== undefined ? FINGER_COLOR[note.finger] : HAND_COLOR[note.hand];
      body.tint = custom ?? (status === "missed" ? MISSED_COLOR : own);
      body.alpha = custom !== undefined ? 1 : !playerNote ? 0.45 : status === "hit" ? 0.3 : 1;
      if (road && bottom < hitY * ARRIVAL_SHARE) {
        this.arrivals.push({
          x: key.x + key.width / 2,
          color: body.tint,
          strength: (1 - bottom / (hitY * ARRIVAL_SHARE)) * body.alpha
        });
      }

      digit.scale.set(Math.min(1, (key.width * 0.9) / 40));
      digit.x = key.x + key.width / 2;
      digit.y = bottom - 2;
      digit.alpha = body.alpha;
      if (cards) {
        // The card stands where the note lands; on the road it faces the player and
        // grows as it comes nearer.
        const centre = key.x + key.width / 2;
        // A sounding note's card waits on the hit line rather than sliding over the keys.
        const landing = Math.min(bottom, hitY);
        const spot = road?.place(centre, landing);
        const scale = cardScale * (spot?.scale ?? 1);
        const x = spot?.x ?? centre;
        const y = spot?.y ?? landing;
        glow.scale.set(scale);
        glow.position.set(x, y + CARD_GLOW * scale);
        glow.tint = body.tint;
        glow.alpha = body.alpha;
        frame.scale.set(scale);
        frame.position.set(x, y);
        frame.tint = body.tint;
        frame.alpha = body.alpha;
        face.scale.set(scale);
        face.position.set(x, y - CARD_FACE_OFFSET * scale);
        face.alpha = body.alpha;
        badge.scale.set(scale * 0.55);
        badge.position.set(x, y - (CARD_HEIGHT - CARD_FACE_OFFSET - 1) * scale);
        badge.alpha = body.alpha;
        continue;
      }
      if (this.noteNames) {
        // Over the finger, when the note is tall enough to hold both.
        name.scale.set(Math.min(1, (key.width * 0.92) / Math.max(name.texture.width, 1)));
        const digitHeight = note.finger === undefined ? 0 : digit.height + 2;
        name.visible = noteHeight >= digitHeight + name.height + 4;
        name.x = key.x + key.width / 2;
        name.y = bottom - 2 - digitHeight;
        name.alpha = body.alpha;
      }
    }
  }

  /** Frees the textures the notes baked for themselves; the shared labels are the view's. */
  destroy(): void {
    for (const texture of this.cardFaces.values()) texture.destroy(true);
    for (const texture of [this.cardFrame, this.cardFrameLeft, this.cardGlow, this.trailTile]) {
      if (texture !== Texture.WHITE) texture.destroy(true);
    }
  }

  private nameTexture(pitch: number): Texture {
    const style = this.noteNames;
    return style ? (this.labels.names.get(nameKey(style, pitch)) ?? Texture.EMPTY) : Texture.EMPTY;
  }

  private cardFace(pitch: number, glyph: ReturnType<typeof noteGlyph>, hand: Hand): Texture {
    const key = `${String(pitch)}:${glyph.kind}:${String(glyph.dotted)}:${hand}`;
    let texture = this.cardFaces.get(key);
    if (!texture) {
      const clef = hand === "left" ? "bass" : "treble";
      texture = bakeCardFace(this.renderer, pitch, glyph, clef);
      this.cardFaces.set(key, texture);
    }
    return texture;
  }
}
