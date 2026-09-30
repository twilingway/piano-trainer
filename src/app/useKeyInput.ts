import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { soundNoteOff, soundNoteOn, startSoundOnFirstGesture } from "../audio/pianoSound";
import { listenToComputerKeyboard, listenToMidi, midiSupported } from "../input/midiInput";
import type { KeyEvent, MidiDevice, MidiEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";

/**
 * Keys into the trainer: the MIDI piano (keys and the sustain pedal) and the
 * computer keyboard, which also sounds the notes it plays.
 */
export function useKeyInput(trainerRef: RefObject<Trainer | null>) {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [midiError, setMidiError] = useState<string | null>(() =>
    midiSupported()
      ? null
      : // Chrome hides Web MIDI on plain http unless the host is localhost.
        !window.isSecureContext
        ? "MIDI доступен только по https или на localhost — откройте http://localhost:5190"
        : "Этот браузер не поддерживает Web MIDI — откройте тренажёр в Chrome или Edge"
  );
  /** Which MIDI input plays; "all" listens to every one. */
  const [midiDeviceId, setMidiDeviceId] = useState("all");
  const midiDeviceRef = useRef("all");

  useEffect(() => {
    const onKey = (event: KeyEvent) => trainerRef.current?.key(event);
    const stopWarmUp = startSoundOnFirstGesture();
    const stopKeyboard = listenToComputerKeyboard((event) => {
      // The computer keyboard has no voice of its own, unlike the piano.
      if (event.type === "down") soundNoteOn(event.pitch);
      else soundNoteOff(event.pitch);
      onKey(event);
    });
    let stopMidi: (() => void) | undefined;
    let disposed = false;
    if (midiSupported()) {
      const onMidiKey = (event: MidiEvent, deviceId: string) => {
        const chosen = midiDeviceRef.current;
        if (chosen !== "all" && chosen !== deviceId) return;
        if (event.type === "pedal") trainerRef.current?.pedal(event.down);
        else onKey(event);
      };
      listenToMidi(onMidiKey, setDevices).then(
        (stop) => {
          if (disposed) stop();
          else stopMidi = stop;
        },
        (error: unknown) => {
          setMidiError(error instanceof Error ? error.message : String(error));
        }
      );
    }
    return () => {
      disposed = true;
      stopWarmUp();
      stopKeyboard();
      stopMidi?.();
    };
  }, [trainerRef]);

  useEffect(() => {
    midiDeviceRef.current = midiDeviceId;
  }, [midiDeviceId]);

  const midiName = devices.length > 0 ? (devices[0]?.name ?? "MIDI") : undefined;

  return { devices, midiError, midiDeviceId, setMidiDeviceId, midiName };
}
