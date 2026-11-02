import { useI18n } from "../../app/useI18n";

export function SettingsDiagnostics({
  fps,
  onFps
}: {
  readonly fps: boolean;
  readonly onFps: (show: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="setting">
      <span>{t("Показывать FPS")}</span>
      <input
        type="checkbox"
        data-setting-target="fps"
        checked={fps}
        onChange={(event) => {
          onFps(event.target.checked);
        }}
      />
    </label>
  );
}
