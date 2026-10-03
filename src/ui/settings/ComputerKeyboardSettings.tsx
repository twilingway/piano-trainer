import { useEffect, useState } from "react";
import type { ComputerKeyboardControls } from "../../app/useComputerKeyboard";
import {
  bindingLabel,
  isAssignableCode,
  KEYBOARD_ROWS,
  keyLabel,
  pitchLabel,
  PRESET_IDS,
  PRESET_TITLES
} from "../../input/keyboardLayouts";
import type { KeyBinding, KeyboardPreset } from "../../input/keyboardLayouts";
import { GameDialog } from "../GameDialog";

interface Props {
  readonly controls: ComputerKeyboardControls;
}

export function ComputerKeyboardSettings({ controls }: Props) {
  const { endEditing } = controls;
  useEffect(() => endEditing, [endEditing]);
  const [selected, setSelected] = useState<string | null>(null);
  const open = (code: string) => {
    controls.beginEditing();
    setSelected(code);
  };
  const close = () => {
    controls.endEditing();
    setSelected(null);
  };
  const visibleCodes = new Set(KEYBOARD_ROWS.flat());
  const extraCodes = Object.keys(controls.bindings).filter((code) => !visibleCodes.has(code));
  const renderKey = (code: string) => (
    <button
      key={code}
      type="button"
      className={`computer-key ${code === "Space" ? "computer-key--space" : ""}`}
      disabled={!isAssignableCode(code)}
      aria-label={`${keyLabel(code)}: ${bindingLabel(controls.bindings[code])}`}
      onClick={() => {
        open(code);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        open(code);
      }}
    >
      <span>{keyLabel(code)}</span>
      <small>
        {code.startsWith("Shift")
          ? "♯"
          : code.startsWith("Alt")
            ? "♭"
            : bindingLabel(controls.bindings[code])}
      </small>
    </button>
  );
  return (
    <section className="computer-keyboard-settings" aria-label="Компьютерная клавиатура">
      <label className="setting">
        <span>Раскладка компьютера</span>
        <select
          className="game-select"
          aria-label="Раскладка компьютера"
          value={controls.prefs.preset}
          onChange={(event) => {
            controls.choosePreset(event.target.value as KeyboardPreset);
          }}
        >
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {PRESET_TITLES[id]}
            </option>
          ))}
        </select>
      </label>
      <p className="computer-keyboard-help">
        Shift — ♯, Alt — ♭, Shift + Alt — натуральная нота. Ctrl + Пробел — пауза.
      </p>
      <p className="computer-keyboard-help">
        Правая кнопка мыши или нажатие на клавишу макета — назначить ноту или действие.
      </p>
      <div className="computer-keyboard-scroll">
        <div className="computer-keyboard-map">
          {KEYBOARD_ROWS.map((row, i) => (
            <div className="computer-keyboard-row" key={i}>
              {row.map(renderKey)}
            </div>
          ))}
          {extraCodes.length > 0 && (
            <div className="computer-keyboard-row">{extraCodes.map(renderKey)}</div>
          )}
        </div>
      </div>
      <button type="button" className="game-button" onClick={controls.reset}>
        Сбросить эту раскладку
      </button>
      <p className="computer-keyboard-help">
        Назначения сохраняются для каждой раскладки. Системные сочетания и некоторые клавиши
        браузера могут быть недоступны.
      </p>
      {controls.error && <p role="alert">{controls.error}</p>}
      {selected !== null && controls.editing && (
        <BindingEditor
          key={`${selected}:${controls.capturedCode ?? ""}`}
          initialCode={selected}
          controls={controls}
          onClose={close}
        />
      )}
    </section>
  );
}

interface EditorProps extends Props {
  readonly initialCode: string;
  readonly onClose: () => void;
}
function BindingEditor({ initialCode, controls, onClose }: EditorProps) {
  const original = controls.bindings[controls.capturedCode ?? initialCode];
  const [kind, setKind] = useState<KeyBinding["type"]>(original?.type ?? "note");
  const [pitch, setPitch] = useState(original?.type === "note" ? original.pitch : 60);
  const code = controls.capturedCode ?? initialCode;
  const binding: KeyBinding = kind === "note" ? { type: "note", pitch } : { type: kind };
  return (
    <GameDialog open title={`Назначение клавиши ${keyLabel(code)}`} onClose={onClose}>
      <div className="settings-list" data-keyboard-editor>
        <p>
          Физическая клавиша: <strong>{keyLabel(code)}</strong>. Сейчас:{" "}
          {bindingLabel(controls.bindings[code])}.
        </p>
        <button type="button" className="game-button" onClick={controls.beginCapture}>
          Перехватить клавишу
        </button>
        {controls.capturing && (
          <div role="status">
            <p>Нажмите нужную клавишу. Escape — отмена захвата.</p>
            <button type="button" onClick={controls.cancelCapture}>
              Отменить захват
            </button>
          </div>
        )}
        <label className="setting">
          <span>Назначение</span>
          <select
            aria-label="Назначение"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as KeyBinding["type"]);
            }}
          >
            <option value="note">Нота</option>
            <option value="sustain">Sustain (педаль)</option>
            <option value="octaveDown">Октава ниже</option>
            <option value="octaveUp">Октава выше</option>
            <option value="disabled">Отключить</option>
          </select>
        </label>
        {kind === "note" && (
          <label className="setting">
            <span>Нота и октава</span>
            <select
              aria-label="Нота и октава"
              value={pitch}
              onChange={(event) => {
                setPitch(Number(event.target.value));
              }}
            >
              {Array.from({ length: 128 }, (_, note) => (
                <option key={note} value={note}>
                  {pitchLabel(note)}
                </option>
              ))}
            </select>
          </label>
        )}
        {code !== initialCode && (
          <p>
            Будет изменено назначение {keyLabel(code)}. Клавиша {keyLabel(initialCode)} останется
            прежней.
          </p>
        )}
        <div className="computer-keyboard-actions">
          <button
            type="button"
            className="game-button"
            disabled={controls.capturing}
            onClick={() => {
              controls.assign(code, binding);
              onClose();
            }}
          >
            Сохранить
          </button>
          <button type="button" className="game-button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </GameDialog>
  );
}
