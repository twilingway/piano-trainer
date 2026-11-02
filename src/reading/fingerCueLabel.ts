import type { Locale } from "../i18n/locales";
import { fingerCueMessages } from "../i18n/fingerCueMessages";
import { translate } from "../i18n/translate";
import type { LessonFingerCue } from "./fingerCues";

export function lessonFingerLabel(cue: LessonFingerCue, locale: Locale): string {
  return translate(locale, fingerCueMessages, cue.hand === "right" ? "П{finger}" : "Л{finger}", {
    finger: cue.recommendedFinger
  });
}
