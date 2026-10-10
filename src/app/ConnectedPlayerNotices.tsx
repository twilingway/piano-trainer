import { useI18n } from "./useI18n";
import { PersistenceNotice } from "./PersistenceNotice";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

import { shallowEqual } from "react-redux";
export function ConnectedNotices() {
  const { fullscreenError, wordStorageError, gameRanked, timingRankedReady, libraryLoadError } =
    useRuntimeSelector(
      (runtime) => ({
        fullscreenError: runtime.fullscreen.error,
        wordStorageError: runtime.word.storageError,
        gameRanked: !runtime.reading.active && runtime.game.ranked,
        timingRankedReady: runtime.timing.rankedReady,
        libraryLoadError: runtime.library.loadError
      }),
      shallowEqual
    );

  const { t } = useI18n();
  return (
    <>
      <PersistenceNotice />
      {wordStorageError && (
        <div className="toast toast--error" role="status">
          {t(wordStorageError)}
        </div>
      )}

      {libraryLoadError && <div className="toast toast--error">{t(libraryLoadError)}</div>}
      {gameRanked && !timingRankedReady && (
        <div className="toast">
          {t(
            "Рейтинг недоступен: выберите одно устройство и откалибруйте его в разделе «Синхронизация»."
          )}
        </div>
      )}

      {fullscreenError && (
        <div className="toast toast--error" role="status">
          {t(fullscreenError)}
        </div>
      )}
    </>
  );
}
