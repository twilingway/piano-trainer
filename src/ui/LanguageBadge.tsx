import type { Locale } from "../i18n/locales";

interface Props {
  readonly locale: Locale;
  readonly label: string;
  readonly onToggle: () => void;
}

export function LanguageBadge({ locale, label, onToggle }: Props) {
  return (
    <button
      type="button"
      className="icon-button topbar-language"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {locale.toUpperCase()}
    </button>
  );
}
