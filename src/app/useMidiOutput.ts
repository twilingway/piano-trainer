import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { midiSupported } from "../input/midiInput";
import type { KeyEvent } from "../input/midiInput";
import { createMelodyMidiOutput } from "../input/melodyMidiOutput";
import type { MelodyMidiOutput } from "../input/melodyMidiOutput";
import { AUTO_OUTPUT_CHOICE, AUTO_OUTPUT_ID, openMidiOutput } from "../input/midiOutput";
import type { MidiOutputControl, OutputState } from "../input/midiOutput";
import { createKeyLights } from "../input/keyLights";
import type { KeyLights, KeyLightSettings } from "../input/keyLights";
import type { Trainer } from "../practice/Trainer";
import type { MidiOutputControls } from "../ui/settings/MidiSettings";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import { activePianoProfile, selectedPianoInstrument } from "./instrumentProfilePreferences";
import { useMidiInstruments } from "./useMidiInstruments";

/**
 * The MIDI output: the stored choice, the connected outputs, the test note and
 * the key lights the trainer asks for. `controls` is undefined when the browser
 * has no Web MIDI; `isEcho` tells our own lights coming back in from a press.
 */
export function useMidiOutput(
  trainerRef: RefObject<Trainer | null>,
  trainerReady: boolean,
  songPlaying = false
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
  const [controlReady, setControlReady] = useState(false);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const profiles = useAppSelector((state) => state.preferences.instrumentProfiles);
  const profile = activePianoProfile(profiles);
  const instrument = selectedPianoInstrument(profiles);
  const preferredName = profile?.midiOutputName;
  const preferredNameRef = useRef(preferredName);
  const conflict = lightSettings.enabled && lightSettings.channel === melody.channel;
  const {
    controls: instrumentPreview,
    stop: stopPreview,
    isEcho: previewEcho
  } = useMidiInstruments({
    controlRef,
    portId: state.current?.id,
    ready: controlReady,
    connectionRevision,
    instrument,
    selectionKey: `${profile?.id ?? ""}:${instrument?.id ?? ""}`,
    channel: melody.channel,
    midiEnabled: melody.mode !== "browser",
    conflict,
    songPlaying
  });

  useEffect(() => {
    const trainer = trainerRef.current;
    if (!trainerReady || !trainer) return;
    trainer.onBeforePlay = stopPreview;
    return () => {
      if (trainer.onBeforePlay === stopPreview) trainer.onBeforePlay = undefined;
    };
  }, [trainerRef, trainerReady, stopPreview]);

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
      if (next.current?.id !== portId) {
        stopPreview();
        setConnectionRevision((value) => value + 1);
      }
      portId = next.current?.id;
      portIdRef.current = portId;
      setState(next);
    };
    openMidiOutput(choiceRef.current, onState, abort.signal, preferredNameRef.current).then(
      (control) => {
        if (abort.signal.aborted) {
          control.dispose();
          return;
        }
        controlRef.current = control;
        setControlReady(true);
        // The player may have chosen while the browser asked for MIDI access.
        control.select(choiceRef.current, preferredNameRef.current);
      },
      // The input reports why MIDI is unavailable; the output just stays empty.
      () => undefined
    );
    return () => {
      abort.abort();
      stopPreview();
      melodyRef.current?.reset();
      controlRef.current?.dispose();
      controlRef.current = null;
      lights.forget();
      lightsRef.current = null;
      setControlReady(false);
    };
  }, [stopPreview]);

  useEffect(() => {
    const changed = choiceRef.current !== choice;
    choiceRef.current = choice;
    preferredNameRef.current = preferredName;
    if (changed) melodyRef.current?.reset();
    stopPreview();
    controlRef.current?.select(choice, preferredName);
  }, [choice, preferredName, stopPreview]);

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
      previewEcho(event) ||
      (melodyRef.current?.isEcho(event) ?? false) ||
      retiredRef.current.some(
        (entry) => performance.now() <= entry.until && entry.output.isEcho(event)
      ),
    [previewEcho]
  );

  if (!midiSupported()) return { controls: undefined, isEcho };
  return {
    isEcho,
    controls: {
      devices: state.devices,
      choice,
      connected: state.current !== undefined,
      selectedId:
        choice?.id === AUTO_OUTPUT_ID ? AUTO_OUTPUT_ID : (state.current?.id ?? choice?.id ?? ""),
      resolvedName: state.current?.name,
      preview: instrumentPreview,
      onSelect: (id) => {
        const device = state.devices.find((candidate) => candidate.id === id);
        // The disconnected choice stays as it was.
        if (id !== "" && id !== AUTO_OUTPUT_ID && !device) return;
        const next =
          id === AUTO_OUTPUT_ID
            ? AUTO_OUTPUT_CHOICE
            : device
              ? { id: device.id, name: device.name }
              : null;
        choiceRef.current = next;
        dispatch(preferencesActions.midiOutputChanged(next));
        melodyRef.current?.reset();
        stopPreview();
        controlRef.current?.select(next, preferredNameRef.current);
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
