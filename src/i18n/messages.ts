import { cameraCompositionMessages } from "./cameraCompositionMessages";
import { settingsHelpMessages } from "./settingsHelpMessages";
import { projectionMessages } from "./projectionMessages";
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
  ...cameraCompositionMessages,
  ...projectionMessages,
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
  ...independentRhythmMessages
};
