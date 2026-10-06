import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { soundNoteOff, soundNoteOn, startSoundOnFirstGesture } from "../audio/pianoSound";
import { listenToMidi, midiSupported } from "../input/midiInput";
import { listenToComputerKeyboard } from "../input/computerKeyboard";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import type { KeyEvent, MidiDevice, MidiEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import { useMidiOutput } from "./useMidiOutput";

/**
 * Keys into the trainer: the MIDI piano (keys and the sustain pedal) and the
 * computer keyboard, which also sounds the notes it plays; and the MIDI output
 * with its key lights, whose echo never reaches the trainer.
 */
export function useKeyInput(
  trainerRef: RefObject<Trainer | null>,
  keyboardOptions: KeyboardInputOptions,
  intercept?: (event: KeyEvent) => boolean,
  trainerReady = false
) {
  const interceptRef = useRef(intercept);
  useEffect(() => {
    interceptRef.current = intercept;
  }, [intercept]);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [midiError, setMidiError] = useState<string | null>(() =>
    midiSupported()
      ? null
      : // Chrome hides Web MIDI on plain http unless the host is localhost.
        !window.isSecureContext
        ? "MIDI работает только по HTTPS или на localhost — откройте http://localhost:5190"
        : "Этот браузер не поддерживает Web MIDI — откройте тренажёр в Chrome или Edge"
  );
  /** Which MIDI input plays; "all" listens to every one. */
  const [midiDeviceId, setMidiDeviceId] = useState("all");
  const midiDeviceRef = useRef("all");
  const { controls: output, isEcho } = useMidiOutput(trainerRef, trainerReady);

  useEffect(() => {
    const onKey = (event: KeyEvent) => {
      if (!interceptRef.current?.(event)) trainerRef.current?.key(event);
    };
    const stopWarmUp = startSoundOnFirstGesture();
    let stopMidi: (() => void) | undefined;
    let disposed = false;
    if (midiSupported()) {
      // A pedal sends "down" over and over while it moves: only the press itself is Overdrive.
      const pedalDown = new Map<string, boolean>();
      const onMidiKey = (event: MidiEvent, deviceId: string) => {
        const chosen = midiDeviceRef.current;
        if (chosen !== "all" && chosen !== deviceId) return;
        // Our own key lights coming back through MIDI Thru are not the player's keys.
        if (event.type !== "pedal" && isEcho(event)) return;
        if (event.type === "pedal") {
          if (event.down && !pedalDown.get(deviceId)) trainerRef.current?.activateOverdrive();
          pedalDown.set(deviceId, event.down);
          trainerRef.current?.pedal(event.down, event.timestamp, event.deviceId);
        } else onKey(event);
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
      stopMidi?.();
    };
  }, [trainerRef, isEcho]);

  useEffect(() => {
    let sustain = false;
    const deferred = new Set<number>();
    return listenToComputerKeyboard(
      (event) => {
        if (event.type === "pedal") {
          if (event.down && !sustain) trainerRef.current?.activateOverdrive();
          sustain = event.down;
          trainerRef.current?.pedal(event.down, event.timestamp, "keyboard");
          if (!sustain) {
            for (const pitch of deferred) soundNoteOff(pitch);
            deferred.clear();
          }
          return;
        }
        if (event.type === "down") {
          deferred.delete(event.pitch);
          soundNoteOn(event.pitch);
        } else if (sustain) deferred.add(event.pitch);
        else soundNoteOff(event.pitch);
        if (!interceptRef.current?.(event)) trainerRef.current?.key(event);
      },
      {
        ...keyboardOptions,
        owedNoteId: () => trainerRef.current?.nextDueNoteId(),
        onOverdrive: () => {
          trainerRef.current?.activateOverdrive();
        }
      }
    );
  }, [trainerRef, keyboardOptions]);

  useEffect(() => {
    midiDeviceRef.current = midiDeviceId;
  }, [midiDeviceId]);

  const midiName = devices.length > 0 ? (devices[0]?.name ?? "MIDI") : undefined;

  /** The MIDI settings' own props: which input plays, why there is none, and the output. */
  const settings = {
    devices,
    deviceId: midiDeviceId,
    onDevice: setMidiDeviceId,
    midiError,
    output
  };
  return { devices, midiError, midiDeviceId, setMidiDeviceId, midiName, settings };
}
