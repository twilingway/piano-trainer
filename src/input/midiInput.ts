export interface KeyEvent {
  readonly type: "down" | "up";
  readonly pitch: number;
  readonly velocity: number;
}

/** The sustain pedal pressed or released. */
export interface PedalEvent {
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

/** Turns one raw MIDI message into a key or pedal event; anything else is ignored. */
export function parseMidiMessage(data: Uint8Array): MidiEvent | undefined {
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
  const access = await navigator.requestMIDIAccess();
  const attach = () => {
    const devices: MidiDevice[] = [];
    access.inputs.forEach((input) => {
      input.onmidimessage = (message: MIDIMessageEvent) => {
        if (!message.data) return;
        const event = parseMidiMessage(message.data);
        if (event) onKey(event, input.id);
      };
      devices.push({ id: input.id, name: input.name ?? input.id });
    });
    onDevices(devices);
  };
  attach();
  access.onstatechange = attach;
  return () => {
    access.onstatechange = null;
    access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
  };
}

/*
 * The computer keyboard as a stand-in piano, two octaves in the tracker
 * layout: Z X C V B N M , . / are the white keys from C3 with S D G H J as the
 * black ones, Q to P the white keys from C4 with 2 3 5 6 7 9 0 as the black
 * ones. Physical key codes, so the Russian layout plays the same keys.
 */
const COMPUTER_KEYS: Readonly<Record<string, number>> = {
  KeyZ: 48,
  KeyS: 49,
  KeyX: 50,
  KeyD: 51,
  KeyC: 52,
  KeyV: 53,
  KeyG: 54,
  KeyB: 55,
  KeyH: 56,
  KeyN: 57,
  KeyJ: 58,
  KeyM: 59,
  Comma: 60,
  Period: 62,
  Slash: 64,
  KeyQ: 60,
  Digit2: 61,
  KeyW: 62,
  Digit3: 63,
  KeyE: 64,
  KeyR: 65,
  Digit5: 66,
  KeyT: 67,
  Digit6: 68,
  KeyY: 69,
  Digit7: 70,
  KeyU: 71,
  KeyI: 72,
  Digit9: 73,
  KeyO: 74,
  Digit0: 75,
  KeyP: 76
};

export function listenToComputerKeyboard(onKey: (event: KeyEvent) => void): () => void {
  const handle = (type: KeyEvent["type"]) => (event: KeyboardEvent) => {
    const pitch = COMPUTER_KEYS[event.code];
    if (pitch === undefined || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLInputElement && target.type === "text") return;
    // A focused select would otherwise jump to the option starting with that letter.
    event.preventDefault();
    if (event.repeat) return;
    onKey({ type, pitch, velocity: 90 });
  };
  const down = handle("down");
  const up = handle("up");
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}
