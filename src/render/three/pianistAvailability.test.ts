import { describe, expect, it, vi } from "vitest";
vi.mock("./pianistModel", () => ({ PIANIST_AVAILABLE: false }));
import { pianistAvailable } from "./pianistAvailability";

describe("public pianist availability without local-models", () => {
  it("exposes the body preference for native 3D hands in production", () => {
    expect(pianistAvailable("3d")).toBe(true);
  });
  it("keeps other styles from asking for the public body", () => {
    expect(pianistAvailable("classic")).toBe(false);
    expect(pianistAvailable("arcade")).toBe(false);
  });
});
