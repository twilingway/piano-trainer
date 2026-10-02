/** All phases use the view's song time, so pause, seek and low FPS stay deterministic. */
export const ARRIVAL_DURATION_S = 0.5;
const CARD_DELAY_S = 0.18;
const CARD_FADE_S = 0.16;

export function noteArrivalAge(start: number, time: number, lookAhead: number): number {
  return time - (start - lookAhead);
}

export function arrivalFrame(age: number, frameCount: number): number | undefined {
  if (age < 0 || age >= ARRIVAL_DURATION_S || !Number.isFinite(age) || frameCount < 1)
    return undefined;
  return Math.min(frameCount - 1, Math.floor((age / ARRIVAL_DURATION_S) * frameCount));
}

export function arrivalCardAlpha(age: number): number {
  return Math.max(0, Math.min(1, (age - CARD_DELAY_S) / CARD_FADE_S));
}
