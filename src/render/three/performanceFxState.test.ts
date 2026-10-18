import { describe, it, expect } from "vitest";
import {
  PerformanceFxState,
  PERFORMANCE_HIT_CAPACITY,
  performanceAtlasFrame
} from "./performanceFxState";
import type { EnergySource } from "../noteEnergy";
const source = (id: string, pitch = 60, sounding = true): EnergySource => ({
  id,
  pitch,
  sounding,
  color: 0x00aaff,
  strength: 1,
  progress: 1
});
describe("session-clock world attacks", () => {
  it("emits only accepted sounding notes, once per id including repeated pitch", () => {
    const state = new PerformanceFxState();
    state.update(1, [source("early", 60, false), source("one")]);
    state.update(1, [source("early", 60, false), source("one")]);
    expect(state.hits.filter((h) => Number.isFinite(h.time))).toHaveLength(1);
    state.update(1.1, [source("one"), source("two")]);
    expect(state.hits.filter((h) => Number.isFinite(h.time))).toHaveLength(2);
  });
  it("holds on pause and clears obsolete attacks on either seek", () => {
    const state = new PerformanceFxState();
    state.update(20, [source("one")]);
    const hits = state.hits.map((h) => ({ ...h }));
    state.update(20, [source("one")]);
    expect(state.hits).toEqual(hits);
    state.update(10, []);
    expect(state.hits.every((h) => h.time === -Infinity)).toBe(true);
    state.update(10.1, [source("two")]);
    state.update(100, []);
    expect(state.hits.every((h) => h.time === -Infinity)).toBe(true);
  });
  it("reuses the fixed burst pool under dense accepted input", () => {
    const state = new PerformanceFxState();
    for (let i = 0; i < 2000; i++) state.update(i * 0.01, [source(String(i), 21 + (i % 88))]);
    expect(state.hits).toHaveLength(PERFORMANCE_HIT_CAPACITY);
    expect(state.hits.every((h) => h.time >= 19)).toBe(true);
    state.clear();
    expect(state.hits.every((h) => h.time === -Infinity)).toBe(true);
  });
  it("samples atlas frames from song time without elapsed state", () => {
    expect(performanceAtlasFrame(1.5, 24, 12)).toBe(0);
    expect(performanceAtlasFrame(-0.1, 24, 12)).toBe(9);
    expect(performanceAtlasFrame(123.4, 24, 96)).toBe(performanceAtlasFrame(123.4, 24, 96));
    expect(performanceAtlasFrame(NaN, 24, 12)).toBe(0);
  });
});
