export interface PianoStartup {
  ready(part: "scene" | "staff"): void;
  fail(): void;
  progress(url: string, loaded: number, total?: number): void;
}

declare global {
  interface Window {
    pianoStartup?: PianoStartup;
    pianoStartupStyleCleanup?: () => void;
  }
}

export function startupReady(part: "scene" | "staff"): void {
  if (typeof window !== "undefined") window.pianoStartup?.ready(part);
}

export function startupFailed(): void {
  if (typeof window !== "undefined") window.pianoStartup?.fail();
}

export function startupProgress(url: string, loaded: number, total?: number): void {
  if (typeof window !== "undefined") window.pianoStartup?.progress(url, loaded, total);
}
