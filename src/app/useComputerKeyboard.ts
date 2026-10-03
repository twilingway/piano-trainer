import { useCallback, useMemo, useState } from "react";
import { effectiveBindings } from "../input/keyboardLayouts";
import type { KeyBinding, KeyboardPreset, KeyboardPrefs } from "../input/keyboardLayouts";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import { loadKeyboardPrefs, saveKeyboardPrefs } from "./keyboardPreferences";

export function useComputerKeyboard() {
  const [prefs, setPrefs] = useState(loadKeyboardPrefs);
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedCode, setCapturedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endEditing = useCallback(() => {
    setEditing(false);
    setCapturing(false);
    setCapturedCode(null);
  }, []);
  const bindings = useMemo(() => effectiveBindings(prefs), [prefs]);
  const update = (next: KeyboardPrefs) => {
    setPrefs(next);
    setError(
      saveKeyboardPrefs(next)
        ? null
        : "Не удалось сохранить раскладку. Настройки действуют до перезагрузки страницы."
    );
  };
  const options: KeyboardInputOptions = useMemo(
    () => ({
      bindings,
      blocked: editing,
      ...(capturing
        ? {
            capture: (code: string) => {
              setCapturedCode(code);
              setCapturing(false);
            },
            cancelCapture: () => {
              setCapturing(false);
            }
          }
        : {})
    }),
    [bindings, editing, capturing]
  );
  return {
    prefs,
    bindings,
    options,
    error,
    capturedCode,
    capturing,
    editing,
    choosePreset: (preset: KeyboardPreset) => {
      update({ ...prefs, preset });
    },
    assign: (code: string, binding: KeyBinding) => {
      update({
        ...prefs,
        overrides: {
          ...prefs.overrides,
          [prefs.preset]: { ...prefs.overrides[prefs.preset], [code]: binding }
        }
      });
    },
    reset: () => {
      const { [prefs.preset]: removed, ...overrides } = prefs.overrides;
      update({ ...prefs, overrides });
    },
    beginEditing: () => {
      setEditing(true);
      setCapturedCode(null);
    },
    endEditing,
    beginCapture: () => {
      setCapturedCode(null);
      setCapturing(true);
    },
    cancelCapture: () => {
      setCapturing(false);
    }
  };
}
export type ComputerKeyboardControls = ReturnType<typeof useComputerKeyboard>;
