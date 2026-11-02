import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { KeyEvent } from "../input/midiInput";
import type { MidiOutputControl } from "../input/midiOutput";
import { instrumentMessages } from "../input/instrumentMessages";
import { createInstrumentPreview, type InstrumentPreview } from "../input/instrumentPreview";
import type { PianoInstrument } from "../input/instrumentProfiles";

export type PreviewUnavailable =
  "no-output" | "no-instrument" | "unmapped" | "conflict" | "playing";
export interface MidiInstrumentPreviewControls {
  readonly available: boolean;
  readonly playing: boolean;
  readonly reason: PreviewUnavailable | undefined;
  readonly onPlay: () => void;
  readonly onStop: () => void;
}

interface Options {
  readonly controlRef: RefObject<MidiOutputControl | null>;
  readonly portId: string | undefined;
  readonly ready: boolean;
  readonly connectionRevision: number;
  readonly instrument: PianoInstrument | undefined;
  readonly selectionKey: string;
  readonly channel: number;
  readonly midiEnabled: boolean;
  readonly conflict: boolean;
  readonly songPlaying: boolean;
}

/** Timbre changes never reconfigure the trainer's audio or advance the song clock. */
export function useMidiInstruments(options: Options) {
  const {
    controlRef,
    portId,
    ready,
    connectionRevision,
    instrument,
    selectionKey,
    channel,
    midiEnabled,
    conflict,
    songPlaying
  } = options;
  const program = instrument?.program;
  const bankMSB = instrument?.bankMSB;
  const bankLSB = instrument?.bankLSB;
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<InstrumentPreview | null>(null);
  const previewPort = useRef<string | undefined>(undefined);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const stop = useCallback(() => previewRef.current?.stop(), []);
  useEffect(() => {
    const preview = createInstrumentPreview((message) => {
      if (previewPort.current) controlRef.current?.send(message, previewPort.current);
    }, setPreviewPlaying);
    previewRef.current = preview;
    window.addEventListener("pagehide", preview.stop);
    return () => {
      preview.stop();
      window.removeEventListener("pagehide", preview.stop);
      if (previewRef.current === preview) previewRef.current = null;
    };
  }, [controlRef]);

  useLayoutEffect(() => {
    stop();
  }, [
    portId,
    ready,
    connectionRevision,
    selectionKey,
    program,
    bankMSB,
    bankLSB,
    channel,
    conflict,
    songPlaying,
    stop
  ]);

  useEffect(() => {
    if (!ready || !portId || program == null || !midiEnabled || conflict) return;
    const mapping = {
      id: "selected",
      name: "",
      program,
      ...(bankMSB === undefined ? {} : { bankMSB }),
      ...(bankLSB === undefined ? {} : { bankLSB })
    };
    for (const message of instrumentMessages(mapping, channel))
      controlRef.current?.send(message, portId);
  }, [
    ready,
    portId,
    connectionRevision,
    program,
    bankMSB,
    bankLSB,
    channel,
    midiEnabled,
    conflict,
    controlRef
  ]);

  const play = useCallback(() => {
    const current = latest.current;
    if (
      !current.ready ||
      !current.portId ||
      current.instrument?.program == null ||
      current.conflict ||
      current.songPlaying
    )
      return;
    previewRef.current?.stop();
    previewPort.current = current.portId;
    previewRef.current?.play(current.instrument, current.channel);
  }, []);
  const isEcho = useCallback((event: KeyEvent) => previewRef.current?.isEcho(event) ?? false, []);
  const reason: PreviewUnavailable | undefined =
    !ready || !portId
      ? "no-output"
      : !instrument
        ? "no-instrument"
        : instrument.program === null
          ? "unmapped"
          : conflict
            ? "conflict"
            : songPlaying
              ? "playing"
              : undefined;
  return {
    controls: {
      available: reason === undefined,
      playing: previewPlaying,
      reason,
      onPlay: play,
      onStop: stop
    },
    stop,
    isEcho
  };
}
