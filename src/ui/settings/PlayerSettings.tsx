import type { ComponentProps, ReactNode } from "react";

import { BUILD_INFO } from "../../app/buildInfo";
import { GameSettings } from "../GameSettings";
import { SettingsPanel } from "../SettingsPanel";
import { AboutSettings } from "./AboutSettings";
import { ComputerKeyboardSettings } from "./ComputerKeyboardSettings";
import { KeyboardSettings } from "./KeyboardSettings";
import { MidiSettings } from "./MidiSettings";
import { PlaySettings } from "./PlaySettings";
import { SongSettings } from "./SongSettings";
import { StaffSettings } from "./StaffSettings";

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly wordTyping: boolean;
  readonly play: ComponentProps<typeof PlaySettings>;
  readonly rules: ComponentProps<typeof GameSettings>;
  readonly song: ComponentProps<typeof SongSettings>;
  readonly staff: ComponentProps<typeof StaffSettings>;
  readonly keyboard: ComponentProps<typeof KeyboardSettings> & {
    readonly fps: boolean;
    readonly onFps: (show: boolean) => void;
  };
  readonly computerKeyboard: ComponentProps<typeof ComputerKeyboardSettings>["controls"];
  readonly wordSettings: ReactNode;
  readonly midi: ComponentProps<typeof MidiSettings>;
  readonly synchronization: ReactNode;
  /** Puts the dragged parts of the current mode's screen back. */
  readonly onResetLayout: () => void;
  /** The edit mode, in which the screen's parts show their handles and drag. */
  readonly editing: boolean;
  readonly onToggleEditing: () => void;
}

/** Compose existing controls without taking ownership of their preferences. */
export function PlayerSettings(props: Props) {
  return (
    <SettingsPanel
      open={props.open}
      onClose={props.onClose}
      tabs={[
        {
          id: "play",
          title: "Игра",
          content: (
            <>
              <section className="settings-group">
                <h3 className="settings-group__title">Режим и темп</h3>
                <PlaySettings {...props.play} />
              </section>
              <div className="settings-group">
                <GameSettings {...props.rules} />
              </div>
            </>
          )
        },
        { id: "song", title: "Песня", content: <SongSettings {...props.song} /> },
        {
          id: "view",
          title: "Вид",
          content: (
            <>
              <section className="settings-group">
                <h3 className="settings-group__title">Нотная запись</h3>
                <StaffSettings {...props.staff} />
              </section>
              <section className="settings-group">
                <h3 className="settings-group__title">Клавиатура и отображение</h3>
                <div className="settings-list">
                  <label className="setting">
                    <span>Показывать FPS</span>
                    <input
                      type="checkbox"
                      checked={props.keyboard.fps}
                      onChange={(event) => {
                        props.keyboard.onFps(event.target.checked);
                      }}
                    />
                  </label>
                </div>
                {props.wordTyping ? (
                  <p className="setting-hint">
                    В режиме «Печатать мелодию» клавиатура автоматически подстраивается под
                    выбранную партию. Её диапазон и отображение задаёт режим.
                  </p>
                ) : (
                  <KeyboardSettings {...props.keyboard} />
                )}
              </section>
              <section className="settings-group">
                <h3 className="settings-group__title">Расположение</h3>
                <p className="setting-hint">
                  В режиме редактирования край стана, линии над и под клавиатурой и бегущую строку
                  можно тянуть мышью.
                  {props.wordTyping ? " Для режима печати" : " Для пианино"} расположение своё.
                </p>
                <div className="setting-control">
                  <button
                    type="button"
                    className="game-button"
                    aria-pressed={props.editing}
                    onClick={props.onToggleEditing}
                  >
                    ✎ Редактировать интерфейс
                  </button>
                  <button type="button" className="game-button" onClick={props.onResetLayout}>
                    Сбросить расположение
                  </button>
                </div>
              </section>
            </>
          )
        },
        {
          id: "computer",
          title: props.wordTyping ? "Печатать мелодию" : "Ввод с ПК",
          content: props.wordTyping ? (
            <>
              {props.wordSettings}
              <p className="setting-hint">
                Назначения строятся для всей песни. Shift и Alt — дополнительные клавиши; настройки
                обычных раскладок здесь не применяются.
              </p>
            </>
          ) : (
            <ComputerKeyboardSettings controls={props.computerKeyboard} />
          )
        },
        { id: "midi", title: "Пианино", content: <MidiSettings {...props.midi} /> },
        { id: "timing", title: "Синхронизация", content: props.synchronization },
        { id: "about", title: "О программе", content: <AboutSettings build={BUILD_INFO} /> }
      ]}
    />
  );
}
