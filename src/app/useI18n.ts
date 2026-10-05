import { useSyncExternalStore } from "react";

import type { MessageParams } from "../i18n/locales";
import { messages } from "../i18n/messages";
import { formatDate, formatNumber, translate } from "../i18n/translate";
import { getInterfaceLanguage, subscribeInterfaceLanguage } from "./interfaceLanguage";

/** Subscribe only to the interface preference, independently of the practice clock. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribeInterfaceLanguage, getInterfaceLanguage);
  return {
    locale,
    t: (message: string, params?: MessageParams) => translate(locale, messages, message, params),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(locale, value, options),
    formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(locale, value, options)
  };
}
