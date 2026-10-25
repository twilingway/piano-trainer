export const FLAME = {
  url: new URL("../../fx/plasma-flame.webp", import.meta.url).href,
  columns: 8,
  rows: 12,
  frames: 96,
  fps: 24,
  anchorY: 0.88
};
export const MIST = {
  additive: false,
  url: new URL("../../fx/piano-mist.webp", import.meta.url).href,
  columns: 8,
  rows: 12,
  frames: 96,
  fps: 16,
  anchorY: 0.8125
};
export const HIT = {
  url: new URL("../../fx/piano-hit.webp", import.meta.url).href,
  columns: 4,
  rows: 3,
  frames: 12,
  fps: 24,
  anchorY: 0.5 + 50 / 384
};
export const GLITTER = {
  url: new URL("../../fx/piano-glitter.webp", import.meta.url).href,
  columns: 6,
  rows: 4,
  frames: 24,
  fps: 24,
  anchorY: 0.5 + 200 / 512
};
