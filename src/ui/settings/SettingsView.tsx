import type { ReactNode } from "react";
import { useI18n } from "../../app/useI18n";
interface Props {
  readonly staff: ReactNode;
  readonly keyboard: ReactNode;
  readonly wordTyping: boolean;
  readonly toggles: ReactNode;
  readonly editing: boolean;
  readonly onToggleEditing: () => void;
  readonly onResetLayout: () => void;
}
export function SettingsView(props: Props) {
  const { t } = useI18n();
  return (
    <>
      <section className="settings-group" aria-label={t("Что показывать")}>
        <h3 className="settings-group__title">{t("Что показывать")}</h3>
        <div className="setting-control setting-control--views">{props.toggles}</div>
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Нотная запись")}</h3>
        {props.staff}
      </section>
      {props.wordTyping ? (
        <section
          className="settings-group"
          data-setting-target="key-style"
          tabIndex={-1}
          aria-disabled="true"
          aria-label={t("Вид клавиш")}
        >
          <h3 className="settings-group__title">{t("Вид клавиш")}</h3>
          <p className="setting-hint">
            {t(
              "В режиме «Печатать мелодию» клавиатура сама подстраивается под выбранную партию, поэтому здесь её не настроить."
            )}
          </p>
        </section>
      ) : (
        props.keyboard
      )}
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Расположение")}</h3>
        <p className="setting-hint">
          {t(
            "В режиме редактирования мышью двигаются край стана, линии над и под клавиатурой и бегущая строка."
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
  );
}
