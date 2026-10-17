import { Sprite, Texture } from "pixi.js";
import type { Container } from "pixi.js";
import type { SongBeat } from "../song/song";
import type { RoadLayer } from "./RoadLayer";

/** A bar across the road at each visible measure start; the container retains its sprite pool. */
export function drawRoadBeatBars(
  bars: Container,
  beats: readonly SongBeat[],
  width: number,
  time: number,
  lookAhead: number,
  hitY: number,
  pixelsPerSecond: number,
  road: Pick<RoadLayer, "beatY">
): void {
  let used = 0;
  for (const beat of beats) {
    if (beat.time < time) continue;
    if (beat.time > time + lookAhead) break;
    if (!beat.downbeat) continue;
    let bar = bars.children[used] as Sprite | undefined;
    if (!bar) {
      bar = new Sprite(Texture.WHITE);
      bar.tint = 0x2f7bff;
      bars.addChild(bar);
    }
    bar.visible = true;
    bar.alpha = 0.4;
    bar.width = width;
    bar.height = 2;
    bar.y = road.beatY(hitY - (beat.time - time) * pixelsPerSecond);
    used++;
  }
  for (let index = used; index < bars.children.length; index++) {
    const bar = bars.children[index];
    if (bar) bar.visible = false;
  }
}
