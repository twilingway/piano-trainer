import type { Hand } from "../fingering/fingering";
import type { ScorePlacement } from "../song/scorePlacement";
import type { Renderer, Texture } from "./flatThree";
import { bakeCardFace } from "./noteCards";
import type { noteGlyph } from "./noteGlyph";

/** The caller owns this cache and releases its baked textures when the song changes. */
export function cardFaceTexture(
  renderer: Renderer,
  cache: Map<string, Texture>,
  pitch: number,
  glyph: ReturnType<typeof noteGlyph>,
  hand: Hand,
  placement?: ScorePlacement
): Texture {
  const key = `${String(pitch)}:${glyph.kind}:${String(glyph.dotted)}:${hand}:${placement?.clef ?? ""}:${String(placement?.position)}:${placement?.accidental ?? ""}`;
  let texture = cache.get(key);
  if (!texture) {
    const clef = placement?.clef ?? (hand === "left" ? "bass" : "treble");
    texture = bakeCardFace(renderer, pitch, glyph, clef, placement);
    cache.set(key, texture);
  }
  return texture;
}
