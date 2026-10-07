import { useCallback, useMemo, useState } from "react";
import { effectiveBindings } from "../input/keyboardLayouts";
import type { KeyBinding, KeyboardPreset } from "../input/keyboardLayouts";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import { persistenceKey } from "./preferencePersistence";

export function useComputerKeyboard() {
  const prefs = useAppSelector((state) => state.preferences.keyboard);
  const dispatch = useAppDispatch();
  const saveError = useAppSelector(
    (state) => state.persistence.errors[persistenceKey("computer-keyboard-v1", "write")]
  );
  const error = saveError
    ? "Не удалось сохранить раскладку: после перезагрузки страницы она сбросится."
    : null;
  const [editing, setEditing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedCode, setCapturedCode] = useState<string | null>(null);
  const endEditing = useCallback(() => {
    setEditing(false);
    setCapturing(false);
    setCapturedCode(null);
  }, []);
  const bindings = useMemo(() => effectiveBindings(prefs), [prefs]);
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
      dispatch(preferencesActions.keyboardPresetChosen(preset));
    },
    assign: (code: string, binding: KeyBinding) => {
      dispatch(preferencesActions.keyboardBindingAssigned({ code, binding }));
    },
    reset: () => {
      dispatch(preferencesActions.keyboardReset());
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
