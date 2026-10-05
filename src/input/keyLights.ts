import type { KeyEvent } from "./midiInput";

export interface KeyLightSettings {
  readonly enabled: boolean;
  /** 1–16. */
  readonly channel: number;
  /** 1–127. */
  readonly velocity: number;
}

export const DEFAULT_KEY_LIGHTS: KeyLightSettings = { enabled: false, channel: 3, velocity: 64 };

/** How near our own message an incoming one may be its echo, in ms. */
export const ECHO_WINDOW_MS = 30;

export interface KeyLights {
  /** Lights exactly these keys: sends only what changed since the last call. */
  show(pitches: readonly number[]): void;
  /** Turns the lit keys off under the old settings; the next `show` lights them anew. */
  configure(settings: KeyLightSettings): void;
  /** Forgets the lit keys without a message: the port they were lit on got a panic. */
  forget(): void;
  /** Whether a MIDI key is our own light coming back through MIDI Thru or an echo. */
  isEcho(event: KeyEvent): boolean;
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;

/**
 * Lights the keys to play on the player's instrument with quiet notes on a
 * channel of its own, and recognises their echo on the way back in.
 */
export function createKeyLights(
  send: (message: number[]) => void,
  settings: KeyLightSettings = DEFAULT_KEY_LIGHTS,
  now: () => number = () => performance.now()
): KeyLights {
  let current = settings;
  const lit = new Set<number>();
  /** When each key was last lit and turned off, by pitch. */
  const sentOn = new Map<number, number>();
  const sentOff = new Map<number, number>();
  const turnOff = (pitch: number) => {
    send([NOTE_OFF | (current.channel - 1), pitch, 0]);
    sentOff.set(pitch, now());
    lit.delete(pitch);
  };
  return {
    show(pitches) {
      if (!current.enabled) return;
      for (const pitch of lit) if (!pitches.includes(pitch)) turnOff(pitch);
      for (const pitch of pitches) {
        if (lit.has(pitch)) continue;
        send([NOTE_ON | (current.channel - 1), pitch, current.velocity]);
        sentOn.set(pitch, now());
        lit.add(pitch);
      }
    },
    configure(next) {
      if (
        next.enabled === current.enabled &&
        next.channel === current.channel &&
        next.velocity === current.velocity
      )
        return;
      for (const pitch of lit) turnOff(pitch);
      current = next;
    },
    forget() {
      lit.clear();
    },
    isEcho(event) {
      if (!current.enabled) return false;
      if (event.channel === current.channel) return true;
      // An echo keeps our velocity; a player's press matches it only by chance.
      if (event.type === "down" && event.velocity !== current.velocity) return false;
      const sent = (event.type === "down" ? sentOn : sentOff).get(event.pitch);
      const at = event.timestamp ?? now();
      return sent !== undefined && Math.abs(at - sent) <= ECHO_WINDOW_MS;
    }
  };
}
