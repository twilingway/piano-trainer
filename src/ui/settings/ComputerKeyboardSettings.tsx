import { useI18n } from "../../app/useI18n";
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
  const { t } = useI18n();
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
      aria-label={`${t(keyLabel(code))}: ${t(bindingLabel(controls.bindings[code]))}`}
      onClick={() => {
        open(code);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        open(code);
      }}
    >
      <span>{t(keyLabel(code))}</span>
      <small>
        {code.startsWith("Shift")
          ? "♯"
          : code.startsWith("Alt")
            ? "♭"
            : t(bindingLabel(controls.bindings[code]))}
      </small>
    </button>
  );
  return (
    <section className="computer-keyboard-settings" aria-label={t("Компьютерная клавиатура")}>
      <label className="setting">
        <span>{t("Раскладка компьютера")}</span>
        <select
          className="game-select"
          aria-label={t("Раскладка компьютера")}
          value={controls.prefs.preset}
          onChange={(event) => {
            controls.choosePreset(event.target.value as KeyboardPreset);
          }}
        >
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {t(PRESET_TITLES[id])}
            </option>
          ))}
        </select>
      </label>
      <p className="computer-keyboard-help">
        {t("Shift — ♯, Alt — ♭, Shift + Alt — натуральная нота. Ctrl + Пробел — пауза.")}
      </p>
      <p className="computer-keyboard-help">
        {t(
          "Чтобы назначить ноту или действие, нажмите на клавишу схемы или кликните по ней правой кнопкой."
        )}
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
        {t("Сбросить эту раскладку")}
      </button>
      <p className="computer-keyboard-help">
        {t(
          "Назначения запоминаются отдельно для каждой раскладки. Системные сочетания и часть клавиш браузер может перехватить."
        )}
      </p>
      {controls.error && <p role="alert">{t(controls.error)}</p>}
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
  const { t } = useI18n();
  const original = controls.bindings[controls.capturedCode ?? initialCode];
  const [kind, setKind] = useState<KeyBinding["type"]>(original?.type ?? "note");
  const [pitch, setPitch] = useState(original?.type === "note" ? original.pitch : 60);
  const code = controls.capturedCode ?? initialCode;
  const binding: KeyBinding = kind === "note" ? { type: "note", pitch } : { type: kind };
  return (
    <GameDialog
      open
      title={t("Назначение клавиши {key}", { key: t(keyLabel(code)) })}
      onClose={onClose}
    >
      <div className="settings-list" data-keyboard-editor>
        <p>
          {t("Физическая клавиша:")} <strong>{t(keyLabel(code))}</strong>
          {t(". Сейчас:")} {t(bindingLabel(controls.bindings[code]))}.
        </p>
        <button type="button" className="game-button" onClick={controls.beginCapture}>
          {t("Выбрать нажатием")}
        </button>
        {controls.capturing && (
          <div role="status">
            <p>{t("Нажмите клавишу, которую хотите настроить. Esc — отмена.")}</p>
            <button type="button" onClick={controls.cancelCapture}>
              {t("Отмена")}
            </button>
          </div>
        )}
        <label className="setting">
          <span>{t("Назначение")}</span>
          <select
            aria-label={t("Назначение")}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as KeyBinding["type"]);
            }}
          >
            <option value="note">{t("Нота")}</option>
            <option value="sustain">{t("Sustain (педаль)")}</option>
            <option value="octaveDown">{t("Октава ниже")}</option>
            <option value="octaveUp">{t("Октава выше")}</option>
            <option value="disabled">{t("Без назначения")}</option>
          </select>
        </label>
        {kind === "note" && (
          <label className="setting">
            <span>{t("Нота и октава")}</span>
            <select
              aria-label={t("Нота и октава")}
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
            {t("Будет изменено назначение {key}. Клавиша {original} останется прежней.", {
              key: t(keyLabel(code)),
              original: t(keyLabel(initialCode))
            })}
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
            {t("Сохранить")}
          </button>
          <button type="button" className="game-button" onClick={onClose}>
            {t("Отмена")}
          </button>
        </div>
      </div>
    </GameDialog>
  );
}
