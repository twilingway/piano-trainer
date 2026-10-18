import { describe, expect, it } from "vitest";
import { parseSongStage } from "./songStage";

describe("a lesson level's stage file", () => {
  it("reads a sign and trims it", () => {
    expect(parseSongStage('{ "sign": "  Sample sign, ура!  " }')).toEqual({
      stage: { sign: "Sample sign, ура!" }
    });
    expect(parseSongStage("{}")).toEqual({ stage: {} });
  });
  it.each([
    ["not JSON", "{ sign: 1 "],
    ["an array", '["Sample"]'],
    ["a string", '"Sample"'],
    ["null", "null"],
    ["an unknown field", '{ "sign": "Sample", "colour": "red" }'],
    ["a number sign", '{ "sign": 7 }'],
    ["an empty sign", '{ "sign": "   " }'],
    ["a two-line sign", '{ "sign": "Sample\nsign" }'],
    ["a tab", '{ "sign": "Sample\tsign" }'],
    ["an 81-character sign", JSON.stringify({ sign: "я".repeat(81) })]
  ])("refuses %s", (_, text) => {
    expect(parseSongStage(text)).toHaveProperty("error");
  });
  it("counts what a reader sees as characters against the limit", () => {
    expect(parseSongStage(JSON.stringify({ sign: "🎹".repeat(80) }))).toHaveProperty("stage");
    expect(parseSongStage(JSON.stringify({ sign: "é".repeat(80) }))).toHaveProperty("stage");
  });
});
