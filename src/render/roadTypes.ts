/** A key being struck right now: where on the hit line, and in what colour. */
export interface Strike {
  /** The key struck: a strike carries on from frame to frame while its key is held. */
  readonly pitch: number;
  readonly x: number;
  readonly color: number;
  readonly screenY?: number | undefined;
}

/** A note coming over the horizon: where it appears and how bright its flash still is. */
export interface Arrival {
  /** Across the flat scene: the middle of the note's key. */
  readonly x: number;
  readonly color: number;
  /** 1 as it appears, fading to 0 as it moves on. */
  readonly age: number;
  readonly width: number;
  readonly screenX?: number | undefined;
  readonly screenY?: number | undefined;
}
