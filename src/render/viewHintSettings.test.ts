import { expect, it, vi } from "vitest";
import type { KeyboardLayer } from "./KeyboardLayer";
import type { NotesLayer } from "./NotesLayer";
import { ViewHintSettings } from "./viewHintSettings";

it("retains pre-mount hint choices and changes each mounted layer without resetting its song", () => {
  let keyboard: KeyboardLayer | undefined;
  let notes: NotesLayer | undefined;
  const settings = new ViewHintSettings(() => ({ keyboard, notes }));
  settings.setNoteNames("en");
  settings.setFingerLabels(false, true);
  const keyFingers = vi.fn(),
    fallingFingers = vi.fn(),
    names = vi.fn();
  keyboard = { setFingersVisible: keyFingers } as unknown as KeyboardLayer;
  notes = { setFingersVisible: fallingFingers, setNoteNames: names } as unknown as NotesLayer;
  settings.applyKeyboard(keyboard);
  settings.applyNotes(notes);
  expect(keyFingers).toHaveBeenCalledExactlyOnceWith(false);
  expect(fallingFingers).toHaveBeenCalledExactlyOnceWith(true);
  expect(names).toHaveBeenCalledExactlyOnceWith("en");
  settings.setNoteNames("ru");
  expect(names).toHaveBeenLastCalledWith("ru");
  expect(keyFingers).toHaveBeenCalledTimes(1);
  settings.setFingerLabels(true, false);
  expect(keyFingers).toHaveBeenLastCalledWith(true);
  expect(fallingFingers).toHaveBeenLastCalledWith(false);
});
