import { createContext } from "react";
import type { WindowViewMemory } from "./windowViewMemory";

/** Initial disclosure state lets optional children exist before the window restores its scroll. */
export const WindowDisclosureContext = createContext<WindowViewMemory | null>(null);
