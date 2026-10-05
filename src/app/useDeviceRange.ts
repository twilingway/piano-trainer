import { useCallback, useMemo, useRef, useState } from "react";

import type { Hand } from "../fingering/fingering";
import {
  bestOctaveShift,
  captureKey,
  deviceKeys,
  outsideCount,
  playableOf
} from "../input/deviceRange";
import type { DeviceRange, RangeCapture } from "../input/deviceRange";
import type { KeyEvent } from "../input/midiInput";
import type { PlayableRange } from "../practice/playableRange";
import type { SongNote } from "../song/song";
import type { DeviceRangeControls } from "../ui/settings/MidiSettings";
import { loadDeviceRange, saveDeviceRange } from "./deviceRangePreferences";

/**
 * The player's keyboard: the stored range, what it limits a run to, and capturing it from two
 * key presses. While capturing, `intercept` keeps the keys away from the trainer.
 */
export function useDeviceRange() {
  const [range, setStoredRange] = useState(loadDeviceRange);
  const [capture, setCapture] = useState<RangeCapture | null>(null);
  const captureRef = useRef<RangeCapture | null>(null);
  /** Keys pressed during a capture: their releases are the capture's too. */
  const capturedKeys = useRef(new Set<number>());

  const setRange = useCallback((next: DeviceRange) => {
    setStoredRange(next);
    saveDeviceRange(next);
  }, []);
  const startCapture = useCallback(() => {
    captureRef.current = { step: "first" };
    setCapture(captureRef.current);
  }, []);
  const cancelCapture = useCallback(() => {
    captureRef.current = null;
    setCapture(null);
  }, []);
  const intercept = useCallback(
    (event: KeyEvent): boolean => {
      if (event.type === "up") return capturedKeys.current.delete(event.pitch);
      const current = captureRef.current;
      if (!current) return false;
      capturedKeys.current.add(event.pitch);
      const next = captureKey(current, event.pitch);
      if (next.step === "done") {
        captureRef.current = null;
        setCapture(null);
        setRange(next.range);
      } else {
        captureRef.current = next;
        setCapture(next);
      }
      return true;
    },
    [setRange]
  );

  const { low, high } = deviceKeys(range);
  const full = playableOf(range) === undefined;
  // A new object only when the keys change: the trainer reloads the run on new options.
  const playable = useMemo(() => (full ? undefined : { low, high }), [full, low, high]);
  const controls: DeviceRangeControls = {
    range,
    onRange: setRange,
    capture,
    onCapture: startCapture,
    onCancelCapture: cancelCapture
  };
  return { range, setRange, playable, capture, startCapture, cancelCapture, intercept, controls };
}

/**
 * The song's octave controls: its shift, how many notes of the hands miss the keyboard, and the
 * shift that fits them best; no notes miss when the keyboard does not apply (the word mode).
 */
export function useRangeFit(
  notes: readonly SongNote[],
  hands: ReadonlySet<Hand>,
  playable: PlayableRange | undefined,
  song: { readonly octave: number; readonly setOctave: (octave: number) => void },
  applies: boolean
) {
  const limits = applies ? playable : undefined;
  const { octave, setOctave } = song;
  return useMemo(
    () => ({
      octave,
      onOctave: setOctave,
      outside: outsideCount(notes, hands, limits),
      bestOctave: bestOctaveShift(notes, hands, limits, octave)
    }),
    [notes, hands, limits, octave, setOctave]
  );
}
