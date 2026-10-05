import { useI18n } from "../../app/useI18n";
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
  /** A connected view can subscribe to live statistics only while this section is mounted. */
  readonly playContent?: ReactNode;
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
  const { t } = useI18n();
  return (
    <SettingsPanel
      open={props.open}
      onClose={props.onClose}
      tabs={[
        {
          id: "play",
          title: t("Игра"),
          render: () => (
            <>
              <section className="settings-group">
                <h3 className="settings-group__title">{t("Режим и темп")}</h3>
                {props.playContent ?? <PlaySettings {...props.play} />}
              </section>
              <div className="settings-group">
                <GameSettings {...props.rules} />
              </div>
            </>
          )
        },
        { id: "song", title: t("Песня"), render: () => <SongSettings {...props.song} /> },
        {
          id: "view",
          title: t("Вид"),
          render: () => (
            <>
              <section className="settings-group">
                <h3 className="settings-group__title">{t("Нотная запись")}</h3>
                <StaffSettings {...props.staff} />
              </section>
              <section className="settings-group">
                <h3 className="settings-group__title">{t("Клавиатура и отображение")}</h3>
                <div className="settings-list">
                  <label className="setting">
                    <span>{t("Показывать FPS")}</span>
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
                    {t(
                      "В режиме «Печатать мелодию» клавиатура автоматически подстраивается под выбранную партию. Её диапазон и отображение задаёт режим."
                    )}
                  </p>
                ) : (
                  <KeyboardSettings {...props.keyboard} />
                )}
              </section>
              <section className="settings-group">
                <h3 className="settings-group__title">{t("Расположение")}</h3>
                <p className="setting-hint">
                  {t(
                    "В режиме редактирования край стана, линии над и под клавиатурой и бегущую строку можно тянуть мышью."
                  )}{" "}
                  {props.wordTyping
                    ? t("Для режима печати расположение своё.")
                    : t("Для пианино расположение своё.")}
                </p>
                <div className="setting-control">
                  <button
                    type="button"
                    className="game-button"
                    aria-pressed={props.editing}
                    onClick={props.onToggleEditing}
                  >
                    {t("✎ Редактировать интерфейс")}
                  </button>
                  <button type="button" className="game-button" onClick={props.onResetLayout}>
                    {t("Сбросить расположение")}
                  </button>
                </div>
              </section>
            </>
          )
        },
        {
          id: "computer",
          title: props.wordTyping ? t("Печатать мелодию") : t("Ввод с ПК"),
          render: () =>
            props.wordTyping ? (
              <>
                {props.wordSettings}
                <p className="setting-hint">
                  {t(
                    "Назначения строятся для всей песни. Shift и Alt — дополнительные клавиши; настройки обычных раскладок здесь не применяются."
                  )}
                </p>
              </>
            ) : (
              <ComputerKeyboardSettings controls={props.computerKeyboard} />
            )
        },
        { id: "midi", title: t("Пианино"), render: () => <MidiSettings {...props.midi} /> },
        { id: "timing", title: t("Синхронизация"), render: () => props.synchronization },
        { id: "about", title: t("О программе"), render: () => <AboutSettings build={BUILD_INFO} /> }
      ]}
    />
  );
}
