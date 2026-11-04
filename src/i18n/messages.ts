import { songCourseMessages } from "./songCourseMessages";
import { SONG_COURSE_NAVIGATION_MESSAGES } from "./songCourseNavigationMessages";
import { songCourseSourceMessages } from "./songCourseSourceMessages";
import { songCourseUiMessages } from "./songCourseUiMessages";
import { beginnerMessages } from "./beginnerMessages";
import { clayMessages } from "./clayMessages";
import { pathMessages } from "./pathMessages";
import { toneLessonMessages } from "./toneLessonMessages";
import { hintMessages } from "./hintMessages";
import { startupMessages } from "./startupMessages";
import { preparationMessages } from "./preparationMessages";
import { fingerCueMessages } from "./fingerCueMessages";
import { guidedLessonMessages } from "./guidedLessonMessages";
import { musicProgressMessages } from "./musicProgressMessages";
import { musicControllerMessages } from "./musicControllerMessages";
import { musicCourseRuntimeMessages } from "./musicCourseRuntimeMessages";
import { musicCourseMessages } from "./musicCourseMessages";
import { worldCameraMessages } from "./worldCameraMessages";
import { settingsHelpMessages } from "./settingsHelpMessages";
import { performanceMessages } from "./performanceMessages";
import { instrumentMessages } from "./instrumentMessages";
import { graphicsMessages } from "./graphicsMessages";
import type { Messages } from "./locales";
import { freeCameraMessages } from "./freeCameraMessages";
import { appMessages } from "./appMessages";
import { settingsMessages1 } from "./settingsMessages1";
import { settingsMessages2 } from "./settingsMessages2";
import { settingsMessages3 } from "./settingsMessages3";
import { uiMessages } from "./uiMessages";
import { uiMessagesExtra } from "./uiMessagesExtra";
import { handStudyMessages } from "./handStudyMessages";
import { courseMessages } from "./courseMessages";
import { readingMessages } from "./readingMessages";
import { intervalMessages } from "./intervalMessages";
import { rhythmMessages } from "./rhythmMessages";
import { bassReadingMessages } from "./bassReadingMessages";
import { twoHandMessages } from "./twoHandMessages";
import { heldBassMessages } from "./heldBassMessages";
import { independentRhythmMessages } from "./independentRhythmMessages";

/** Catalog modules are added here; Russian source messages remain the fallback. */
export const messages: Messages = {
  ...songCourseMessages,
  ...SONG_COURSE_NAVIGATION_MESSAGES,
  ...songCourseSourceMessages,
  ...songCourseUiMessages,
  ...beginnerMessages,
  ...clayMessages,
  ...pathMessages,
  ...hintMessages,
  ...startupMessages,
  ...preparationMessages,
  ...musicProgressMessages,
  ...musicControllerMessages,
  ...musicCourseMessages,
  ...musicCourseRuntimeMessages,
  ...worldCameraMessages,
  ...settingsHelpMessages,
  ...instrumentMessages,
  ...graphicsMessages,
  ...appMessages,
  ...performanceMessages,
  ...freeCameraMessages,
  ...settingsMessages1,
  ...settingsMessages2,
  ...settingsMessages3,
  ...uiMessages,
  ...uiMessagesExtra,
  ...handStudyMessages,
  ...courseMessages,
  ...readingMessages,
  ...intervalMessages,
  ...rhythmMessages,
  ...bassReadingMessages,
  ...twoHandMessages,
  ...heldBassMessages,
  ...toneLessonMessages,
  ...fingerCueMessages,
  ...guidedLessonMessages,
  ...independentRhythmMessages
};
