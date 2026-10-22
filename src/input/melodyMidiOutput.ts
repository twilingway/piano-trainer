import type { KeyEvent } from "./midiInput";

/** Automatic notes scheduled against the session's performance clock. */
export interface MelodyMidiOutput {
  noteOn(pitch: number, velocity: number, timestamp: number, id: string): void;
  noteOff(pitch: number, timestamp: number, id: string): void;
  reset(): void;
  isEcho(event: KeyEvent): boolean;
}

const ECHO_MS = 100;
interface SentNote {
  readonly type: "down" | "up";
  readonly pitch: number;
  readonly velocity: number;
  readonly at: number;
}

/** Owns only its notes; cancelling playback never clears another channel's queue. */
export function createMelodyMidiOutput(
  send: (message: number[]) => void,
  channel: number,
  now: () => number = () => performance.now()
): MelodyMidiOutput {
  const jobs = new Set<ReturnType<typeof setTimeout>>();
  const held = new Map<string, number>();
  const counts = new Map<number, number>();
  const sent: SentNote[] = [];
  let generation = 0;
  const emit = (type: "down" | "up", pitch: number, velocity: number) => {
    const at = now();
    while (sent[0] && at - sent[0].at > ECHO_MS) sent.shift();
    sent.push({ type, pitch, velocity, at });
    send([(type === "down" ? 0x90 : 0x80) | (channel - 1), pitch, velocity]);
  };
  const enqueue = (timestamp: number, action: () => void) => {
    const epoch = generation;
    const delay = Math.max(0, timestamp - now());
    if (delay === 0) {
      action();
      return;
    }
    const job = setTimeout(() => {
      jobs.delete(job);
      if (epoch === generation) action();
    }, delay);
    jobs.add(job);
  };
  return {
    noteOn(pitch, velocity, timestamp, id) {
      enqueue(timestamp, () => {
        if (held.has(id)) return;
        held.set(id, pitch);
        const count = counts.get(pitch) ?? 0;
        counts.set(pitch, count + 1);
        if (count === 0) emit("down", pitch, Math.max(1, Math.min(127, Math.round(velocity))));
      });
    },
    noteOff(_pitch, timestamp, id) {
      enqueue(timestamp, () => {
        const pitch = held.get(id);
        if (pitch === undefined) return;
        held.delete(id);
        const count = (counts.get(pitch) ?? 1) - 1;
        if (count > 0) counts.set(pitch, count);
        else {
          counts.delete(pitch);
          emit("up", pitch, 0);
        }
      });
    },
    reset() {
      generation++;
      for (const job of jobs) clearTimeout(job);
      jobs.clear();
      for (const pitch of counts.keys()) emit("up", pitch, 0);
      held.clear();
      counts.clear();
    },
    isEcho(event) {
      if (event.source !== "midi" || event.channel !== channel) return false;
      const at = event.timestamp ?? now();
      return sent.some(
        (note) =>
          note.type === event.type &&
          note.pitch === event.pitch &&
          (event.type === "up" || note.velocity === event.velocity) &&
          at >= note.at &&
          at - note.at <= ECHO_MS
      );
    }
  };
}
