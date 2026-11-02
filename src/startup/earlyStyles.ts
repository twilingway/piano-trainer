/** Runs at the start of head, before any stylesheet can finish loading. */
export function captureStartupStyles(): void {
  const capture = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLLinkElement) || target.rel !== "stylesheet") return;
    target.dataset.startupSettled = "true";
    if (event.type === "error") target.dataset.startupFailed = "true";
  };
  document.addEventListener("load", capture, true);
  document.addEventListener("error", capture, true);
  window.pianoStartupStyleCleanup = () => {
    document.removeEventListener("load", capture, true);
    document.removeEventListener("error", capture, true);
    delete window.pianoStartupStyleCleanup;
  };
}
