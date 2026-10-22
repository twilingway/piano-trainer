import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { midiSupported } from "../input/midiInput";
import type { KeyEvent } from "../input/midiInput";
import { createMelodyMidiOutput } from "../input/melodyMidiOutput";
import type { MelodyMidiOutput } from "../input/melodyMidiOutput";
import { openMidiOutput } from "../input/midiOutput";
import type { MidiOutputControl, OutputState } from "../input/midiOutput";
import { createKeyLights } from "../input/keyLights";
import type { KeyLights, KeyLightSettings } from "../input/keyLights";
import type { Trainer } from "../practice/Trainer";
import type { MidiOutputControls } from "../ui/settings/MidiSettings";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";

/**
 * The MIDI output: the stored choice, the connected outputs, the test note and
 * the key lights the trainer asks for. `controls` is undefined when the browser
 * has no Web MIDI; `isEcho` tells our own lights coming back in from a press.
 */
export function useMidiOutput(
  trainerRef: RefObject<Trainer | null>,
  trainerReady: boolean
): { controls: MidiOutputControls | undefined; isEcho: (event: KeyEvent) => boolean } {
  const melody = useAppSelector((state) => state.preferences.melodyOutput);
  const melodyRef = useRef<MelodyMidiOutput | undefined>(undefined);
  const retiredRef = useRef<{ output: MelodyMidiOutput; until: number }[]>([]);
  const portIdRef = useRef<string | undefined>(undefined);
  const choice = useAppSelector((state) => state.preferences.midiOutput);
  const dispatch = useAppDispatch();
  const [state, setState] = useState<OutputState>({ devices: [] });
  const lightSettings = useAppSelector((state) => state.preferences.keyLights);
  const choiceRef = useRef(choice);
  const controlRef = useRef<MidiOutputControl | null>(null);
  const lightsRef = useRef<KeyLights | null>(null);

  useEffect(() => {
    if (!midiSupported()) return;
    // Off until the settings below apply.
    const lights = createKeyLights((message) => {
      controlRef.current?.send(message);
    });
    lightsRef.current = lights;
    // StrictMode unmounts the first mount before access arrives: that one stays silent.
    const abort = new AbortController();
    let portId: string | undefined;
    const onState = (next: OutputState) => {
      // The port left behind got a panic: the lights start over on the new one.
      if (next.current?.id !== portId) lights.forget();
      portId = next.current?.id;
      portIdRef.current = portId;
      setState(next);
    };
    openMidiOutput(choiceRef.current, onState, abort.signal).then(
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
      melodyRef.current?.reset();
      controlRef.current?.dispose();
      controlRef.current = null;
      lights.forget();
      lightsRef.current = null;
    };
  }, []);

  useEffect(() => {
    choiceRef.current = choice;
    melodyRef.current?.reset();
    controlRef.current?.select(choice);
  }, [choice]);

  useEffect(() => {
    lightsRef.current?.configure(lightSettings);
  }, [lightSettings]);

  useEffect(() => {
    const trainer = trainerRef.current;
    // Off, the trainer is not asked for its keys at all.
    if (!trainerReady || !trainer || !lightSettings.enabled) return;
    const show = (pitches: readonly number[]) => {
      lightsRef.current?.show(pitches);
    };
    trainer.onLights = show;
    return () => {
      if (trainer.onLights === show) trainer.onLights = undefined;
    };
  }, [trainerRef, trainerReady, lightSettings.enabled]);

  const portId = state.current?.id;
  const conflict = lightSettings.enabled && lightSettings.channel === melody.channel;
  useEffect(() => {
    const trainer = trainerRef.current;
    if (!trainerReady || !trainer) return;
    const midi =
      melody.mode !== "browser" && portId !== undefined && !conflict
        ? createMelodyMidiOutput((message) => {
            if (portIdRef.current === portId) controlRef.current?.send(message);
          }, melody.channel)
        : undefined;
    melodyRef.current = midi;
    trainer.setMelodyOutput({ browser: melody.mode !== "midi", midi });
    const stop = () => midi?.reset();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      midi?.reset();
      if (midi) {
        const now = performance.now();
        retiredRef.current = retiredRef.current.filter((entry) => entry.until >= now);
        retiredRef.current.push({ output: midi, until: now + 100 });
      }
      if (melodyRef.current === midi) melodyRef.current = undefined;
    };
  }, [trainerRef, trainerReady, portId, melody.mode, melody.channel, conflict]);

  const isEcho = useCallback(
    (event: KeyEvent) =>
      (lightsRef.current?.isEcho(event) ?? false) ||
      (melodyRef.current?.isEcho(event) ?? false) ||
      retiredRef.current.some(
        (entry) => performance.now() <= entry.until && entry.output.isEcho(event)
      ),
    []
  );

  if (!midiSupported()) return { controls: undefined, isEcho };
  return {
    isEcho,
    controls: {
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
        dispatch(preferencesActions.midiOutputChanged(next));
        melodyRef.current?.reset();
        controlRef.current?.select(next);
      },
      onTest: () => {
        controlRef.current?.test();
      },
      melody,
      onMelody: (next) => {
        dispatch(preferencesActions.melodyOutputChanged(next));
      },
      lights: lightSettings,
      onLights: (next: KeyLightSettings) => {
        dispatch(preferencesActions.keyLightsChanged(next));
      }
    }
  };
}
