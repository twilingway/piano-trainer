import { LOCALES, type Locale } from "../i18n/locales";
import { LanguageBadge } from "../ui/LanguageBadge";
import { setInterfaceLanguage } from "./interfaceLanguage";
import { useI18n } from "./useI18n";

export function ConnectedLanguageBadge() {
  const { locale, t } = useI18n();
  const next: Locale = locale === "ru" ? "en" : "ru";
  return (
    <LanguageBadge
      locale={locale}
      label={`${t("Язык интерфейса")}: ${LOCALES[locale].name} → ${LOCALES[next].name}`}
      onToggle={() => {
        setInterfaceLanguage(next);
      }}
    />
  );
}
