interface MidiEvent {
  readonly tick: number;
  readonly pedal: boolean;
  readonly bytes: Uint8Array;
}

const invalid = (): never => {
  throw new Error("Неверный MIDI при упорядочивании педали.");
};

function orderedTrack(input: Uint8Array): Uint8Array {
  let position = 0,
    tick = 0,
    running = 0;
  const events: MidiEvent[] = [];
  const byte = (): number => {
    const value = input[position++];
    return value ?? invalid();
  };
  const variable = (): number => {
    let value = 0;
    for (let index = 0; index < 4; index++) {
      const part = byte();
      value = value * 128 + (part & 127);
      if (part < 128) return value;
    }
    return invalid();
  };
  while (position < input.length) {
    tick += variable();
    const start = position;
    let status = input[position] ?? invalid();
    if (status < 128) {
      if (!running) invalid();
      status = running;
    } else position++;
    if (status < 0xf0) {
      running = status;
      const size = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
      const payload = [status];
      for (let index = 0; index < size; index++) {
        const value = byte();
        if (value >= 128) invalid();
        payload.push(value);
      }
      events.push({
        tick,
        pedal: (status & 0xf0) === 0xb0 && payload[1] === 64,
        bytes: new Uint8Array(payload)
      });
    } else {
      if (status === 0xff) byte();
      else if (status === 0xf0 || status === 0xf7) running = 0;
      else invalid();
      const size = variable();
      position += size;
      if (position > input.length) invalid();
      events.push({ tick, pedal: false, bytes: input.slice(start, position) });
    }
  }
  // Stable sorting preserves the model's order among simultaneous pedal events.
  events.sort((a, b) => a.tick - b.tick || Number(b.pedal) - Number(a.pedal));
  const output: number[] = [];
  let previous = 0;
  for (const event of events) {
    let delta = event.tick - previous;
    const encoded = [delta & 127];
    while ((delta = Math.floor(delta / 128)) > 0) encoded.unshift((delta & 127) | 128);
    output.push(...encoded);
    for (const value of event.bytes) output.push(value);
    previous = event.tick;
  }
  return new Uint8Array(output);
}

/** CC64 at a release tick must reach the receiver before that note-off. */
export function orderPedalEvents(input: Uint8Array): Uint8Array {
  if (input.length < 14 || String.fromCharCode(...input.slice(0, 4)) !== "MThd") invalid();
  const chunks: Uint8Array[] = [];
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let position = 0;
  while (position < input.length) {
    if (position + 8 > input.length) invalid();
    const size = view.getUint32(position + 4);
    const end = position + 8 + size;
    if (end > input.length) invalid();
    const name = String.fromCharCode(...input.slice(position, position + 4));
    if (position === 0 && size < 6) invalid();
    if (name === "MTrk") {
      const data = orderedTrack(input.subarray(position + 8, end));
      const chunk = new Uint8Array(8 + data.length);
      chunk.set(input.subarray(position, position + 4));
      new DataView(chunk.buffer).setUint32(4, data.length);
      chunk.set(data, 8);
      chunks.push(chunk);
    } else chunks.push(input.slice(position, end));
    position = end;
  }
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}
