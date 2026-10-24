import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../app/useI18n";
import type { PianoInstrument, PianoProfile } from "../../input/instrumentProfiles";

interface Props {
  readonly profile: PianoProfile | undefined;
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
}

/** Navigation stays local until the player explicitly chooses a voice. */
export function InstrumentChooser({ profile, value, onChange }: Props) {
  const { t } = useI18n();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{
    container: Element;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [active, setActive] = useState(value ?? "");
  const instruments = profile?.instruments ?? [];
  const selected = instruments.find((item) => item.id === value);
  const groups = new Map<string, PianoInstrument[]>();
  for (const instrument of instruments) {
    const group = instrument.group ?? "";
    const items = groups.get(group) ?? [];
    items.push(instrument);
    groups.set(group, items);
  }
  const enabled = [
    "",
    ...[...groups.values()]
      .flat()
      .filter((item) => item.program !== null)
      .map((item) => item.id)
  ];
  const label = (item: PianoInstrument) =>
    `${item.panelNumber === undefined ? "" : `VOI${String(item.panelNumber).padStart(3, "0")} · `}${item.name}${item.program === null ? t(" — нет MIDI-команды") : ""}`;
  const optionId = (key: string) => `${id}-option-${encodeURIComponent(key)}`;

  function open() {
    const button = trigger.current;
    if (!profile || !button) return;
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const height = Math.min(320, Math.max(below, rect.top - 8));
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
    setActive(selected?.id ?? "");
    setPopup({
      container: button.closest("dialog") ?? document.body,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: below >= height ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
      width,
      height
    });
  }

  useLayoutEffect(() => {
    if (popup)
      document
        .getElementById(`${id}-option-${encodeURIComponent(active)}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [popup, active, id]);

  useEffect(() => {
    if (!popup) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!trigger.current?.contains(node) && !list.current?.contains(node)) setPopup(null);
    };
    const reposition = (event: Event) => {
      if (event.target instanceof Node && list.current?.contains(event.target)) return;
      setPopup(null);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [popup]);

  function choose(key: string) {
    if (!enabled.includes(key)) return;
    setPopup(null);
    trigger.current?.focus();
    if (key !== (value ?? "")) onChange(key || null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && popup) {
      event.preventDefault();
      event.stopPropagation();
      setPopup(null);
    } else if (event.key === "Tab") setPopup(null);
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!popup) {
        open();
        return;
      }
      const index = enabled.indexOf(active);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : Math.max(
                0,
                Math.min(enabled.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))
              );
      setActive(enabled[next] ?? "");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (popup) choose(active);
      else open();
    }
  }

  function option(key: string, text: string, disabled = false) {
    return (
      <div
        id={optionId(key)}
        key={key}
        role="option"
        aria-selected={key === (value ?? "")}
        aria-disabled={disabled || undefined}
        className={`instrument-chooser__option${active === key ? " is-active" : ""}`}
        onPointerMove={() => {
          if (!disabled) setActive(key);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          choose(key);
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        data-keyboard-editor
        className="game-select instrument-chooser__trigger"
        aria-label={t("Тембр MIDI-пианино")}
        data-setting-target="instrument-voice"
        aria-expanded={popup !== null}
        aria-controls={`${id}-list`}
        aria-haspopup="listbox"
        aria-activedescendant={popup ? optionId(active) : undefined}
        disabled={!profile}
        onClick={() => {
          if (popup) setPopup(null);
          else open();
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget)) setPopup(null);
        }}
      >
        <span>{selected ? label(selected) : t("Не менять тембр")}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {popup &&
        createPortal(
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label={t("Тембр MIDI-пианино")}
            className="instrument-chooser__list"
            style={{
              left: popup.left,
              top: popup.top,
              width: popup.width,
              maxHeight: popup.height
            }}
          >
            {option("", t("Не менять тембр"))}
            {[...groups].map(([group, items]) => (
              <div role="group" aria-label={group || t("Другие тембры")} key={group}>
                <div className="instrument-chooser__group">{group || t("Другие тембры")}</div>
                {items.map((item) => option(item.id, label(item), item.program === null))}
              </div>
            ))}
          </div>,
          popup.container
        )}
    </>
  );
}
