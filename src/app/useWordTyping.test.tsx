// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import { generateWordTyping } from "../wordTyping/optimizer";
import type { Language, WordTypingResult } from "../wordTyping/types";
import { createAppStore } from "./store";
import { withTestStore } from "./storeTestSupport";
import { setInterfaceLanguage } from "./interfaceLanguage";
import {
  useWordTyping,
  useWordTypingInterfaceLanguage,
  type WordTypingControls
} from "./useWordTyping";

const song: Song = {
  title: "test",
  source: "midi",
  duration: 1,
  beats: [],
  measures: [],
  notes: [{ id: "a", pitch: 60, start: 0, startBeat: 0, duration: 1, hand: "right" }]
};
let controls: WordTypingControls;
function Harness({ playing }: { readonly playing: boolean }) {
  const word = useWordTyping(song, "language-test");
  useWordTypingInterfaceLanguage(word, playing);
  useLayoutEffect(() => {
    controls = word;
  }, [word]);
  return <span>{word.language}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setInterfaceLanguage("ru");
  localStorage.removeItem("word-typing-prefs-v1");
});

it("freezes automatic worker language during play, applies it on pause and keeps manual choices", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests: { language: Language }[] = [];
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((event: MessageEvent<{ result: WordTypingResult }>) => void) | null = null;
      onerror = null;
      postMessage(request: { language: Language }) {
        requests.push(request);
        const result = generateWordTyping(
          song.notes,
          [{ word: request.language === "en" ? "a" : "я", rank: 1 }],
          request.language
        );
        this.onmessage?.(new MessageEvent("message", { data: { result } }));
      }
      terminate() {
        /* A pending worker has no resources in this test. */
      }
    }
  );
  localStorage.setItem("word-typing-prefs-v1", JSON.stringify({ enabled: true, language: "ru" }));
  setInterfaceLanguage("en");
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const store = createAppStore();
  try {
    await act(async () => {
      await Promise.resolve();
      root.render(withTestStore(<Harness playing={false} />, store));
    });
    expect(controls.language).toBe("en");
    expect(controls.pending).toBe(false);
    expect(controls.result?.tokens).toHaveLength(1);
    expect(requests.map((r) => r.language)).toEqual(["en"]);
    await act(async () => {
      await Promise.resolve();
      root.render(withTestStore(<Harness playing />, store));
    });
    const before = controls.keyboard;
    const beforeResult = controls.result;
    const beforeInput = controls.keyboardOptions;
    const beforeKey = controls.practiceKey;
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("ru");
    });
    expect(controls.language).toBe("en");
    expect(controls.keyboard).toBe(before);
    expect(controls.result).toBe(beforeResult);
    expect(controls.keyboardOptions).toBe(beforeInput);
    expect(controls.practiceKey).toBe(beforeKey);
    expect(requests.map((r) => r.language)).toEqual(["en"]);
    await act(async () => {
      await Promise.resolve();
      root.render(withTestStore(<Harness playing={false} />, store));
    });
    expect(controls.language).toBe("ru");
    expect(controls.result?.language).toBe("ru");
    expect(controls.result?.tokens).toHaveLength(1);
    expect(requests.map((r) => r.language)).toEqual(["en", "ru"]);
    await act(async () => {
      await Promise.resolve();
      controls.update({ language: "en" });
    });
    expect(controls.languageManuallyChosen).toBe(true);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("ru");
    });
    expect(controls.language).toBe("en");
    expect(controls.result?.language).toBe("en");
    expect(requests.map((r) => r.language)).toEqual(["en", "ru"]);
  } finally {
    await act(async () => {
      await Promise.resolve();
      root.unmount();
    });
    host.remove();
  }
});
