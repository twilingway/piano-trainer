import { useEffect, useRef, useState } from "react";

import { midiSupported } from "../input/midiInput";
import { openMidiOutput } from "../input/midiOutput";
import type { MidiOutputControl, OutputState } from "../input/midiOutput";
import type { MidiOutputControls } from "../ui/settings/MidiSettings";
import { loadMidiOutput, saveMidiOutput } from "./midiOutputPreferences";

/**
 * The MIDI output: the stored choice, the connected outputs and the test note.
 * Undefined when the browser has no Web MIDI.
 */
export function useMidiOutput(): MidiOutputControls | undefined {
  const [choice, setChoice] = useState(loadMidiOutput);
  const [state, setState] = useState<OutputState>({ devices: [] });
  const choiceRef = useRef(choice);
  const controlRef = useRef<MidiOutputControl | null>(null);

  useEffect(() => {
    if (!midiSupported()) return;
    // StrictMode unmounts the first mount before access arrives: that one stays silent.
    const abort = new AbortController();
    openMidiOutput(choiceRef.current, setState, abort.signal).then(
      (control) => {
        if (abort.signal.aborted) {
          control.dispose();
          return;
        }
        controlRef.current = control;
        // The player may have chosen while the browser asked for MIDI access.
        control.select(choiceRef.current);
      },
      // The input reports why MIDI is unavailable; the output just stays empty.
      () => undefined
    );
    return () => {
      abort.abort();
      controlRef.current?.dispose();
      controlRef.current = null;
    };
  }, []);

  if (!midiSupported()) return undefined;
  return {
    devices: state.devices,
    choice,
    connected: state.current !== undefined,
    selectedId: state.current?.id ?? choice?.id ?? "",
    onSelect: (id) => {
      const device = state.devices.find((candidate) => candidate.id === id);
      // The disconnected choice stays as it was.
      if (id !== "" && !device) return;
      const next = device ? { id: device.id, name: device.name } : null;
      choiceRef.current = next;
      setChoice(next);
      saveMidiOutput(next);
      controlRef.current?.select(next);
    },
    onTest: () => {
      controlRef.current?.test();
    }
  };
}
