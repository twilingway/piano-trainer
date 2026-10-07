import type { ReactNode } from "react";
import { useI18n } from "../../app/useI18n";
interface Props {
  readonly staff: ReactNode;
  readonly keyboard: ReactNode;
  readonly wordTyping: boolean;
  readonly fps: boolean;
  readonly onFps: (show: boolean) => void;
  readonly editing: boolean;
  readonly onToggleEditing: () => void;
  readonly onResetLayout: () => void;
}
export function SettingsView(props: Props) {
  const { t } = useI18n();
  return (
    <>
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Нотная запись")}</h3>
        {props.staff}
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Клавиатура и отображение")}</h3>
        <div className="settings-list">
          <label className="setting">
            <span>{t("Показывать FPS")}</span>
            <input
              type="checkbox"
              checked={props.fps}
              onChange={(event) => {
                props.onFps(event.target.checked);
              }}
            />
          </label>
        </div>
        {props.wordTyping ? (
          <p className="setting-hint">
            {t(
              "В режиме «Печатать мелодию» клавиатура сама подстраивается под выбранную партию, поэтому здесь её не настроить."
            )}
          </p>
        ) : (
          props.keyboard
        )}
      </section>
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
