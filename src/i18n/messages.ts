import type { Messages } from "./locales";
import { appMessages } from "./appMessages";
import { settingsMessages1 } from "./settingsMessages1";
import { settingsMessages2 } from "./settingsMessages2";
import { settingsMessages3 } from "./settingsMessages3";
import { uiMessages } from "./uiMessages";
import { uiMessagesExtra } from "./uiMessagesExtra";

/** Catalog modules are added here; Russian source messages remain the fallback. */
export const messages: Messages = {
  ...appMessages,
  ...settingsMessages1,
  ...settingsMessages2,
  ...settingsMessages3,
  ...uiMessages,
  ...uiMessagesExtra
};
