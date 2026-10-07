import { useI18n } from "../../app/useI18n";
import type { ReactNode } from "react";
import { BUILD_INFO } from "../../app/buildInfo";
import { SettingsPanel } from "../SettingsPanel";
import { AboutSettings } from "./AboutSettings";
interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly wordTyping: boolean;
  readonly play: ReactNode;
  readonly rules: ReactNode;
  readonly song: ReactNode;
  readonly view: ReactNode;
  readonly computer: ReactNode;
  readonly midi: ReactNode;
  readonly synchronization: ReactNode;
}
/** Slots are mounted only for the active tab; the shell owns navigation alone. */
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
                {props.play}
              </section>
              <div className="settings-group">{props.rules}</div>
            </>
          )
        },
        { id: "song", title: t("Песня"), render: () => props.song },
        { id: "view", title: t("Вид"), render: () => props.view },
        {
          id: "computer",
          title: props.wordTyping ? t("Печатать мелодию") : t("Ввод с ПК"),
          render: () => props.computer
        },
        { id: "midi", title: t("Пианино"), render: () => props.midi },
        { id: "timing", title: t("Синхронизация"), render: () => props.synchronization },
        { id: "about", title: t("О программе"), render: () => <AboutSettings build={BUILD_INFO} /> }
      ]}
    />
  );
}
