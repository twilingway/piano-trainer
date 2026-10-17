/** Maximum particle lifetime, in visual seconds supplied by the renderer. */
export const EMBER_LIFE_S = 11;

export interface EmberPosition {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  alive: boolean;
  rotation: number;
  axisScale: number;
}

function random(seed: number, channel: number): number {
  let value = (seed ^ Math.imul(channel, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
}

export function emberLifetime(seed: number): number {
  return 7 + random(seed, 1) * (EMBER_LIFE_S - 7);
}

/** Long played notes shed slightly larger embers, with a bounded transparent footprint. */
export function emberSizeForDuration(duration = 1): number {
  const seconds = Number.isNaN(duration) ? 1 : Math.max(0, duration);
  return 0.85 + 0.5 * (1 - Math.exp(-seconds / 2));
}

/** Emission grows with time already played, rather than with a future written duration. */
export function emberRateForHold(seconds = 0): number {
  const held = Number.isNaN(seconds) ? 0 : Math.max(0, seconds);
  return 2 + 4 * (1 - Math.exp(-held / 2));
}

/** Deterministic rising embers in screen coordinates, relative to the strike point. */
export function emberAt(
  seed: number,
  age: number,
  height: number,
  width: number,
  out: EmberPosition = { x: 0, y: 0, alpha: 0, scale: 0, alive: false, rotation: 0, axisScale: 1 }
): EmberPosition {
  const lifetime = emberLifetime(seed);
  const elapsed = Math.max(0, age);
  const progress = Math.min(1, elapsed / lifetime);
  const rise = 1.07 + random(seed, 2) * 0.11;
  const travel = rise * (1 - (1 - progress) ** (1.1 + random(seed, 6) * 0.3));
  const phase = random(seed, 3) * Math.PI * 2;
  const frequency = 0.65 + random(seed, 4) * 0.4;
  const wander =
    (Math.sin(elapsed * frequency + phase) - Math.sin(phase)) * 0.19 +
    (Math.sin(elapsed * frequency * 1.618 + phase * 0.73) - Math.sin(phase * 0.73)) * 0.09;
  const alive = age >= 0 && age < lifetime;
  const orbitSpeed = (random(seed, 7) < 0.5 ? -1 : 1) * (0.5 + random(seed, 8));
  const theta = phase + elapsed * orbitSpeed;
  const initialRadius = 0.08 + random(seed, 9) * 0.1;
  const radius = initialRadius + (0.14 + random(seed, 10) * 0.28) * progress;
  out.x =
    width *
    (radius * Math.cos(theta) -
      initialRadius * Math.cos(phase) +
      wander * (0.2 + random(seed, 11) * 0.3));
  out.y =
    -Math.max(0, height) * travel +
    (Math.sin(theta) - Math.sin(phase)) * Math.min(8, Math.max(0, height) * 0.01);
  // Fade by altitude so different flight speeds all dissolve near the upper edge.
  const fade = Math.min(1, Math.max(0, (travel - 0.75) / 0.33));
  const dissolve = 1 - fade * fade * (3 - 2 * fade);
  const pulse = (0.5 + 0.5 * Math.sin(elapsed * (1.4 + random(seed, 12) * 0.8) + phase)) ** 2;
  const glimmer = 0.18 + 0.82 * pulse;
  const birth = 1 - Math.exp(-elapsed * 1.5);
  out.alpha = alive ? (1 - 0.12 * progress) * dissolve * glimmer * birth : 0;
  out.scale = (0.8 + random(seed, 5) * 0.35) * (1 - progress * 0.15) * (0.9 + 0.25 * pulse);
  out.alive = alive;
  const spinSpeed = (random(seed, 13) < 0.5 ? -1 : 1) * (0.35 + random(seed, 14) * 1.05);
  out.rotation = phase + elapsed * spinSpeed;
  const axis = Math.cos(elapsed * (0.7 + random(seed, 15) * 1.9) + phase);
  out.axisScale = (axis < 0 ? -1 : 1) * Math.max(0.2, Math.abs(axis));
  return out;
}
