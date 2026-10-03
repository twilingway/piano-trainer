export interface InputMetadata {
  readonly timestamp?: number;
  readonly source?: "midi" | "keyboard" | "pointer";
  readonly deviceId?: string;
}

export interface KeyEvent extends InputMetadata {
  readonly type: "down" | "up";
  readonly pitch: number;
  readonly velocity: number;
}

/** The sustain pedal pressed or released. */
export interface PedalEvent extends InputMetadata {
  readonly type: "pedal";
  readonly down: boolean;
}

export type MidiEvent = KeyEvent | PedalEvent;

export interface MidiDevice {
  readonly id: string;
  readonly name: string;
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN_PEDAL = 64;
/** A controller value from 64 up means "on". */
const PEDAL_DOWN_FROM = 64;
let midiRequestGeneration = 0;

/** Turns one raw MIDI message into a key or pedal event; anything else is ignored. */
export function parseMidiMessage(data: Uint8Array): MidiEvent | undefined {
  if (data.length < 3 || (data[1] ?? 128) > 127 || (data[2] ?? 128) > 127) return undefined;
  const [status = 0, first = 0, second = 0] = data;
  const command = status & 0xf0;
  // Many keyboards send "note on, velocity 0" instead of a note off.
  if (command === NOTE_ON && second > 0) return { type: "down", pitch: first, velocity: second };
  if (command === NOTE_OFF || command === NOTE_ON) {
    return { type: "up", pitch: first, velocity: second };
  }
  if (command === CONTROL_CHANGE && first === SUSTAIN_PEDAL) {
    return { type: "pedal", down: second >= PEDAL_DOWN_FROM };
  }
  return undefined;
}

export function midiSupported(): boolean {
  return "requestMIDIAccess" in navigator;
}

/**
 * Listens to every MIDI input the browser exposes, now and when a device is
 * plugged in later; each key event names the input it came from, so the
 * caller can keep to one device. Returns a function that stops listening.
 */
export async function listenToMidi(
  onKey: (event: MidiEvent, deviceId: string) => void,
  onDevices: (devices: MidiDevice[]) => void
): Promise<() => void> {
  const generation = ++midiRequestGeneration;
  const access = await navigator.requestMIDIAccess();
  // StrictMode may dispose a pending request before a newer request resolves.
  if (generation !== midiRequestGeneration) return () => undefined;
  let stopped = false;
  const handlers = new Map<MIDIInput, (message: MIDIMessageEvent) => void>();
  const attach = () => {
    if (stopped || generation !== midiRequestGeneration) return;
    const devices: MidiDevice[] = [];
    access.inputs.forEach((input) => {
      const handler = (message: MIDIMessageEvent) => {
        if (!message.data) return;
        const event = parseMidiMessage(message.data);
        if (event && Number.isFinite(message.timeStamp)) {
          onKey(
            { ...event, timestamp: message.timeStamp, source: "midi", deviceId: input.id },
            input.id
          );
        }
      };
      input.onmidimessage = handler;
      handlers.set(input, handler);
      devices.push({ id: input.id, name: input.name ?? input.id });
    });
    onDevices(devices);
  };
  attach();
  access.onstatechange = attach;
  return () => {
    stopped = true;
    if (access.onstatechange === attach) access.onstatechange = null;
    for (const [input, handler] of handlers) {
      if (input.onmidimessage === handler) input.onmidimessage = null;
    }
    handlers.clear();
  };
}

export { listenToComputerKeyboard } from "./computerKeyboard";
