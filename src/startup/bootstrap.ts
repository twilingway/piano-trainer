import { createResourceProgress } from "./resourceProgress";
import type { PianoStartup } from "./bridge";

export interface StartupBootstrapOptions {
  readonly messages: Readonly<Record<"ru" | "en", Readonly<Record<string, string>>>>;
  readonly sizes: Readonly<Record<string, number>>;
  readonly initial?: readonly string[];
}

/** Inlined into HTML by Vite; no React, external fonts or downloaded script dependencies. */
export function bootPianoStartup(options: StartupBootstrapOptions): void {
  const overlay = document.getElementById("piano-startup");
  const root = document.getElementById("root");
  if (!overlay || !root) return;
  const pendingStyles = new Set<HTMLLinkElement>();
  let earlyStyleFailed = false;
  for (const stylesheet of document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"][media="print"]'
  )) {
    const critical = new URL(stylesheet.href, document.baseURI).origin === location.origin;
    const activateStylesheet = () => {
      stylesheet.media = "all";
      stylesheet.dataset.startupSettled = "true";
      if (pendingStyles.delete(stylesheet)) finishIfReady();
    };
    stylesheet.addEventListener("load", activateStylesheet, { once: true });
    stylesheet.addEventListener(
      "error",
      () => {
        stylesheet.dataset.startupSettled = "true";
        if (pendingStyles.delete(stylesheet)) api.fail();
      },
      { once: true }
    );
    if (critical && stylesheet.dataset.startupFailed === "true") earlyStyleFailed = true;
    if (critical && !stylesheet.sheet && stylesheet.dataset.startupSettled !== "true")
      pendingStyles.add(stylesheet);
    if (stylesheet.sheet || stylesheet.dataset.startupSettled === "true") activateStylesheet();
  }
  window.pianoStartupStyleCleanup?.();
  const pathLocale = /^\/(ru|en)(?:\/(?:index\.html)?)?$/.exec(location.pathname)?.[1];
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("interface-language-v1");
  } catch {
    // The automatic language remains available when storage access is denied.
  }
  const locale =
    saved === "ru" || saved === "en"
      ? saved
      : /^ru(?:-|$)/i.test(pathLocale ?? navigator.language)
        ? "ru"
        : "en";
  const t = (message: string, params: Readonly<Record<string, string>> = {}) =>
    (options.messages[locale][message] ?? message).replace(
      /\{(\w+)\}/g,
      (token, key: string) => params[key] ?? token
    );
  const set = (id: string, value: string) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const bytes = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
      value / 1_000_000
    );
  const normalize = (url: string) => {
    const normalized = new URL(url, document.baseURI);
    normalized.searchParams.delete("t");
    normalized.searchParams.delete("v");
    normalized.hash = "";
    return normalized.href;
  };
  const progress = createResourceProgress(
    Object.fromEntries(
      (options.initial ?? []).map((url) => [normalize(url), options.sizes[url] ?? 0])
    )
  );
  let finished = false;
  let failed = false;
  let observer: PerformanceObserver | undefined;
  const ready = new Set<string>();
  const previousInert = root.inert;
  root.inert = true;
  const renderProgress = () => {
    const state = progress.snapshot();
    set(
      "startup-resources",
      t("Ресурсы: {loaded} МБ · из кеша {cached} МБ", {
        loaded: bytes(state.loaded),
        cached: bytes(state.cached)
      })
    );
    set("startup-network", t("Сетевой трафик: {network} МБ", { network: bytes(state.network) }));
    set(
      "startup-estimate",
      t("Для запуска: примерно {total} МБ ресурсов", { total: bytes(state.estimatedTotal) })
    );
    set(
      "startup-remaining",
      t("Осталось примерно {remaining} МБ ресурсов", { remaining: bytes(state.estimatedRemaining) })
    );
    set(
      "startup-known",
      state.knownPending
        ? t("В текущих загрузках осталось {remaining} МБ", { remaining: bytes(state.remaining) })
        : ""
    );
  };
  set("startup-title", t("Загружаем пианино"));
  set("startup-brand", t("Нотопад"));
  set("startup-stage", t("Готовим сцену и ноты"));
  set("startup-reload", t("Перезагрузить страницу"));
  overlay.lang = locale;
  renderProgress();
  const record = (entry: PerformanceEntry) => {
    if (entry.entryType !== "resource") return;
    const resource = entry as PerformanceResourceTiming;
    const url = new URL(entry.name, document.baseURI);
    if (
      url.origin !== location.origin ||
      /(?:favicon|social-card|apple-touch-icon)/.test(url.pathname)
    )
      return;
    // transferSize measures actual network bytes, including headers and 304 revalidations.
    // encodedBodySize may still describe the cached body on a 304 and must not stand in for traffic.
    progress.update(normalize(url.href), {
      loaded: resource.decodedBodySize,
      complete: true,
      cached:
        (resource.transferSize === 0 || resource.responseStatus === 304) &&
        resource.decodedBodySize > 0,
      network: resource.transferSize,
      identity: JSON.stringify([
        url.href,
        resource.startTime,
        resource.duration,
        resource.initiatorType
      ])
    });
  };
  const removeHandlers = () => {
    observer?.disconnect();
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
  function finishIfReady() {
    if (finished || failed || pendingStyles.size > 0 || !ready.has("scene") || !ready.has("staff"))
      return;
    finished = true;
    removeHandlers();
    overlay?.remove();
    document.documentElement.classList.remove("piano-booting");
    if (root) root.inert = previousInert;
    delete window.pianoStartup;
  }
  const api: PianoStartup = {
    ready(part) {
      if (finished || failed) return;
      ready.add(part);
      finishIfReady();
    },
    fail() {
      if (finished || failed) return;
      failed = true;
      removeHandlers();
      overlay.classList.add("startup-failed");
      set("startup-title", t("Не удалось загрузить пианино"));
      set("startup-stage", t("Проверьте подключение и попробуйте ещё раз"));
      const reload = document.getElementById("startup-reload");
      if (reload) reload.hidden = false;
    },
    progress(url, loaded, total) {
      if (finished || failed) return;
      const normalized = normalize(url);
      const resourceUrl = new URL(normalized);
      const known = total ?? options.sizes[resourceUrl.pathname + resourceUrl.search];
      progress.update(normalized, { loaded, ...(known !== undefined ? { total: known } : {}) });
      renderProgress();
    }
  };
  const onError = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement && target.type === "module") api.fail();
    else if (event instanceof ErrorEvent && event.error) api.fail();
  };
  const onRejection = () => {
    api.fail();
  };
  document.getElementById("startup-reload")?.addEventListener("click", () => {
    location.reload();
  });
  window.pianoStartup = api;
  if (earlyStyleFailed) {
    api.fail();
    return;
  }
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  if (typeof PerformanceObserver !== "undefined") {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record(entry);
        renderProgress();
      });
      observer.observe({ type: "resource", buffered: true });
    } catch {
      // Older browsers still get model progress and a truthful unknown full remainder.
    }
  }
}
