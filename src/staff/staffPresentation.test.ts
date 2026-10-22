import { describe, expect, it } from "vitest";
import { watchStaffPresentation } from "./staffPresentation";

it("only presents a ready visible score after a painted frame, and cancels old runs", () => {
  let callback: FrameRequestCallback = () => undefined;
  let ready = false,
    visible = false;
  const shown: number[] = [];
  const cancelled: number[] = [];
  let id = 0;
  const stop = watchStaffPresentation(
    () => ready,
    (at) => shown.push(at),
    (fn) => {
      callback = fn;
      return ++id;
    },
    (id) => cancelled.push(id),
    () => visible
  );
  callback(10);
  ready = true;
  callback(20);
  expect(shown).toEqual([]);
  visible = true;
  callback(30);
  expect(shown).toEqual([]);
  callback(40);
  expect(shown).toEqual([40]);
  stop();
  expect(cancelled).toHaveLength(1);
});
describe("presentation visibility", () => {
  it("starts the two-frame observation again after the tab is hidden", () => {
    let callback: FrameRequestCallback = () => undefined;
    let visible = true;
    const shown: number[] = [];
    watchStaffPresentation(
      () => true,
      (at) => shown.push(at),
      (fn) => {
        callback = fn;
        return 1;
      },
      () => undefined,
      () => visible
    );
    callback(1);
    visible = false;
    callback(2);
    visible = true;
    callback(3);
    expect(shown).toEqual([]);
    callback(4);
    expect(shown).toEqual([4]);
  });
});
