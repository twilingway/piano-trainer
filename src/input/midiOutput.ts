import type { MidiDevice } from "./midiInput";

/** The output the player chose: its id, and its name for when the browser renumbers the port. */
export interface OutputChoice {
  readonly id: string;
  readonly name: string;
}

export interface OutputState {
  /** The connected outputs. */
  readonly devices: readonly MidiDevice[];
  /** The chosen output when it is connected; messages go there. */
  readonly current?: MidiDevice;
}

export interface MidiOutputControl {
  /** Switches to another output, or to none; the previous one gets a panic. */
  select(choice: OutputChoice | null): void;
  /** Lights C4 on the current output for a second. */
  test(): void;
  /** Stops listening and sends a panic to the current output. */
  dispose(): void;
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const ALL_NOTES_OFF = 123;
const CHANNELS = 16;
const TEST_PITCH = 60;
const TEST_VELOCITY = 64;
const TEST_MS = 1000;

/** The chosen output among the connected ones: by id, then by name. */
export function findOutput(
  devices: readonly MidiDevice[],
  choice: OutputChoice | null
): MidiDevice | undefined {
  if (!choice) return undefined;
  return (
    devices.find((device) => device.id === choice.id) ??
    devices.find((device) => device.name === choice.name)
  );
}

/** All Notes Off on every channel. */
export function panicMessages(): number[][] {
  return Array.from({ length: CHANNELS }, (_, channel) => [
    CONTROL_CHANGE | channel,
    ALL_NOTES_OFF,
    0
  ]);
}

function sendSafely(output: MIDIOutput, data: number[], timestamp?: number) {
  try {
    output.send(data, timestamp);
  } catch {
    // A port unplugged a moment ago throws InvalidStateError.
  }
}

function panic(output: MIDIOutput | undefined) {
  if (output?.state !== "connected") return;
  for (const message of panicMessages()) sendSafely(output, message);
}

/**
 * Opens the MIDI outputs and keeps the chosen one connected as ports come and
 * go; `onState` hears the connected outputs and which of them is in use.
 * Listens with `addEventListener`, since the input owns `onstatechange`.
 */
export async function openMidiOutput(
  choice: OutputChoice | null,
  onState: (state: OutputState) => void
): Promise<MidiOutputControl> {
  const access = await navigator.requestMIDIAccess();
  let chosen = choice;
  let port: MIDIOutput | undefined;
  let disposed = false;
  const refresh = () => {
    if (disposed) return;
    const outputs: MIDIOutput[] = [];
    access.outputs.forEach((output) => {
      if (output.state !== "disconnected") outputs.push(output);
    });
    const devices = outputs.map((output) => ({ id: output.id, name: output.name ?? output.id }));
    const current = findOutput(devices, chosen);
    const next = outputs.find((output) => output.id === current?.id);
    if (next !== port) panic(port);
    port = next;
    onState(current ? { devices, current } : { devices });
  };
  const onPageHide = () => {
    panic(port);
  };
  access.addEventListener("statechange", refresh);
  window.addEventListener("pagehide", onPageHide);
  refresh();
  return {
    select(next) {
      chosen = next;
      refresh();
    },
    test() {
      if (disposed || !port) return;
      sendSafely(port, [NOTE_ON, TEST_PITCH, TEST_VELOCITY]);
      // The browser holds the release until then: no timer to clear.
      sendSafely(port, [NOTE_OFF, TEST_PITCH, 0], performance.now() + TEST_MS);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      access.removeEventListener("statechange", refresh);
      window.removeEventListener("pagehide", onPageHide);
      panic(port);
      port = undefined;
    }
  };
}
