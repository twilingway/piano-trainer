import type { GraphicsFailureKind } from "../render/graphicsFailure";
import { useI18n } from "../app/useI18n";
import { GameDialog } from "./GameDialog";

interface Props {
  readonly failure: GraphicsFailureKind;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onShow: () => void;
}

export function GraphicsNotice({ failure, open, onClose, onRetry, onShow }: Props) {
  const { t } = useI18n();
  const title = t(
    failure === "unsupported"
      ? "Графика не поддерживается"
      : failure === "lost"
        ? "Графическое соединение прервано"
        : "Графика недоступна"
  );
  return (
    <>
      {!open && (
        <div className="toast toast--error" role="status">
          <button type="button" className="game-button" onClick={onShow}>
            {title}
          </button>
        </div>
      )}
      <GameDialog open={open} title={title} onClose={onClose}>
        <p>
          {t(
            failure === "unsupported"
              ? "Для игрового поля нужен WebGL2. Этот браузер не предоставляет его. Попробуйте обновить браузер или открыть игру на другом устройстве."
              : failure === "lost"
                ? "Браузер потерял графический контекст. Исполнение приостановлено. После восстановления продолжите игру кнопкой «Играть»."
                : "Браузер поддерживает WebGL2, но не смог запустить графику. Проверьте аппаратное ускорение и драйвер видеокарты, затем повторите попытку."
          )}
        </p>
        <p>
          {t(
            "Библиотека, настройки и нотный стан остаются доступны. Ваша песня и настройки сохранены."
          )}
        </p>
        {failure === "lost" ? (
          <p role="status">{t("Ожидаем восстановления графики…")}</p>
        ) : (
          <button type="button" className="game-button" onClick={onRetry}>
            {t("Повторить запуск графики")}
          </button>
        )}
      </GameDialog>
    </>
  );
}
