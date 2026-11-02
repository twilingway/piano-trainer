import { normalizeReadingSeed } from "../reading/generator";

/** The same deterministic PRNG family as the existing reading and interval courses. */
export function musicRandom(seed: number): () => number {
  let state = normalizeReadingSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function musicChoice<T>(values: readonly T[], random: () => number): T {
  if (values.length === 0) throw new RangeError("Music choice requires at least one value");
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new RangeError("Music random value must be in [0, 1)");
  return value;
}
