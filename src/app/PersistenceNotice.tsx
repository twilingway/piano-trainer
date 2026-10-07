import { useAppSelector } from "./storeHooks";
import { useI18n } from "./useI18n";

export function PersistenceNotice() {
  const errors = useAppSelector((state) => state.persistence.errors);
  const { t } = useI18n();
  return Object.keys(errors).length > 0 ? (
    <div className="toast toast--error" role="status">
      {t(
        "Не удалось прочитать или сохранить часть данных. Изменения доступны до закрытия страницы."
      )}
    </div>
  ) : null;
}
