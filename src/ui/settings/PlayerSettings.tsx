import type { ComponentProps, ReactNode } from "react";

import { GameSettings } from "../GameSettings";
import { SettingsPanel } from "../SettingsPanel";
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
  readonly keyboard: ComponentProps<typeof KeyboardSettings>;
  readonly computerKeyboard: ComponentProps<typeof ComputerKeyboardSettings>["controls"];
  readonly wordSettings: ReactNode;
  readonly midi: ComponentProps<typeof MidiSettings>;
  readonly synchronization: ReactNode;
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
                {props.wordTyping ? (
                  <p className="setting-hint">
                    В режиме «Печатать мелодию» клавиатура автоматически подстраивается под
                    выбранную партию. Её диапазон и отображение задаёт режим.
                  </p>
                ) : (
                  <KeyboardSettings {...props.keyboard} />
                )}
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
        { id: "timing", title: "Синхронизация", content: props.synchronization }
      ]}
    />
  );
}
