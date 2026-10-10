import { createContext, createElement, useContext, useState, type ReactNode } from "react";

import type { BeatSpot } from "./liveCursor";

export interface ReaderBarline {
  readonly beat: number;
  readonly x: number;
}

export interface ReaderSystem {
  readonly line: number;
  readonly startBeat: number;
  readonly endBeat: number;
  /** Rightmost extent from the SVG's left edge, in screen pixels. */
  readonly width: number;
  readonly barlines: readonly ReaderBarline[];
}

/** Engraved coordinates only: music and the live clock remain owned by the song/session. */
export interface ReaderGeometry {
  readonly spots: readonly BeatSpot[];
  readonly systems: readonly ReaderSystem[];
  readonly svgOffsetX: number;
  readonly viewportWidth: number;
}

const GeometryContext = createContext<ReaderGeometry | null>(null);
const PublishContext = createContext<(geometry: ReaderGeometry | null) => void>(() => undefined);
type ReadFrameBeat = (frameTimestamp: number, readBeat: () => number) => number;
const FrameBeatContext = createContext<ReadFrameBeat>((_timestamp, readBeat) => readBeat());

/** Cache a sampled session beat only for callers in the same animation frame. */
export function createReaderFrameBeat(): ReadFrameBeat {
  let frame: { timestamp: number; beat: number } | undefined;
  return (timestamp, readBeat) => {
    if (frame?.timestamp !== timestamp) frame = { timestamp, beat: readBeat() };
    return frame.beat;
  };
}

/** A score-local exchange; key this provider by the XML to discard a previous score immediately. */
export function ReaderGeometryProvider({ children }: { readonly children: ReactNode }) {
  const [geometry, publish] = useState<ReaderGeometry | null>(null);
  // Both RAF callbacks receive the same timestamp. Sample the session once; never advance time.
  const [readFrameBeat] = useState(createReaderFrameBeat);
  return createElement(
    FrameBeatContext.Provider,
    { value: readFrameBeat },
    createElement(
      PublishContext.Provider,
      { value: publish },
      createElement(GeometryContext.Provider, { value: geometry }, children)
    )
  );
}

export function useReaderGeometry(): ReaderGeometry | null {
  return useContext(GeometryContext);
}

export function usePublishReaderGeometry(): (geometry: ReaderGeometry | null) => void {
  return useContext(PublishContext);
}

export function useReaderFrameBeat(): ReadFrameBeat {
  return useContext(FrameBeatContext);
}
