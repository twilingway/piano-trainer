import { describe, expect, it } from "vitest";
import { createResourceProgress } from "./resourceProgress";

describe("startup resource progress", () => {
  it("reconciles streamed content with compressed completion without double counting", () => {
    const resources = createResourceProgress();
    resources.update("piano.glb", { loaded: 400, total: 1_000 });
    expect(resources.snapshot()).toMatchObject({
      loaded: 400,
      remaining: 600,
      knownPending: true,
      cached: 0,
      network: 0
    });
    resources.update("piano.glb", { loaded: 1_000, complete: true, network: 300 });
    resources.update("piano.glb", { loaded: 800, total: 1_000 });
    expect(resources.snapshot()).toMatchObject({
      loaded: 1_000,
      remaining: 0,
      knownPending: false,
      cached: 0,
      network: 300
    });
  });

  it("separates cached resources and does not invent remaining for unknown lengths", () => {
    const resources = createResourceProgress();
    resources.update("cached.js", { loaded: 500, complete: true, cached: true, network: 0 });
    resources.update("stream.glb", { loaded: 250 });
    expect(resources.snapshot()).toMatchObject({
      loaded: 750,
      remaining: 0,
      knownPending: false,
      cached: 500,
      network: 0
    });
  });

  it("rejects invalid samples and never reports a negative remainder", () => {
    const resources = createResourceProgress();
    resources.update("invalid", { loaded: NaN, total: 1_000 });
    resources.update("model", { loaded: 1_200, total: 1_000 });
    expect(resources.snapshot()).toMatchObject({
      loaded: 1_200,
      remaining: 0,
      knownPending: false,
      cached: 0,
      network: 0
    });
  });

  it("counts repeated completed requests once per timing identity while replacing streamed samples", () => {
    const resources = createResourceProgress();
    resources.update("piano.glb", { loaded: 400, total: 1_000 });
    resources.update("piano.glb", {
      loaded: 1_000,
      complete: true,
      network: 500,
      identity: "first"
    });
    resources.update("piano.glb", { loaded: 0, total: 1_000 });
    resources.update("piano.glb", { loaded: 200, total: 1_000 });
    resources.update("piano.glb", {
      loaded: 1_000,
      complete: true,
      network: 300,
      cached: true,
      identity: "second"
    });
    resources.update("piano.glb", {
      loaded: 1_000,
      complete: true,
      network: 300,
      cached: true,
      identity: "second"
    });
    expect(resources.snapshot()).toMatchObject({
      loaded: 2_000,
      remaining: 0,
      knownPending: false,
      cached: 1_000,
      network: 800
    });
  });

  it("starts with a build estimate and refines it without mixing decoded and network bytes", () => {
    const resources = createResourceProgress({ "entry.js": 1_000, "piano.glb": 2_000 });
    expect(resources.snapshot()).toMatchObject({
      estimatedTotal: 3_000,
      estimatedRemaining: 3_000
    });
    resources.update("piano.glb", { loaded: 500, total: 2_000 });
    expect(resources.snapshot()).toMatchObject({
      loaded: 500,
      estimatedTotal: 3_000,
      estimatedRemaining: 2_500
    });
    resources.update("entry.js", { loaded: 1_000, complete: true, network: 200 });
    resources.update("extra.png", { loaded: 100, complete: true, network: 70 });
    expect(resources.snapshot()).toMatchObject({
      loaded: 1_600,
      network: 270,
      estimatedTotal: 3_100,
      estimatedRemaining: 1_500
    });
  });
});
