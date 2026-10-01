import { Assets, Rectangle, Texture } from "pixi.js";

/*
 * The lights over the keys, baked by Arcadia Effector as looping atlases:
 * src/fx/key-wait.json breathes slowly over a key waiting to be played,
 * src/fx/key-lit.json burns with sparks over a key that sounds. Both are
 * white for a tint and the size of one key, 16 frames of 64×256 in 8×2.
 */
const ATLASES = {
  wait: new URL("../fx/key-wait.webp", import.meta.url).href,
  lit: new URL("../fx/key-lit.webp", import.meta.url).href
} as const;
const FRAME = { width: 64, height: 256, cols: 8, count: 16 } as const;
/** Frames a second, as the editor exported them: one loop in 1.2 s. */
export const KEY_LIGHT_FPS = 13.33;

export interface KeyLights {
  readonly wait: readonly Texture[];
  readonly lit: readonly Texture[];
}

/** Loads both loops; undefined when they cannot be had, and the keys keep a plain light. */
export async function loadKeyLights(): Promise<KeyLights | undefined> {
  try {
    const [wait, lit] = await Promise.all([
      Assets.load<Texture>(ATLASES.wait),
      Assets.load<Texture>(ATLASES.lit)
    ]);
    return { wait: frames(wait), lit: frames(lit) };
  } catch (error) {
    console.warn("The key lights did not load; the keys keep a plain light", error);
    return undefined;
  }
}

function frames(atlas: Texture): Texture[] {
  return Array.from(
    { length: FRAME.count },
    (_, index) =>
      new Texture({
        source: atlas.source,
        frame: new Rectangle(
          (index % FRAME.cols) * FRAME.width,
          Math.floor(index / FRAME.cols) * FRAME.height,
          FRAME.width,
          FRAME.height
        )
      })
  );
}
