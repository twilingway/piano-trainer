import { translate } from "../../i18n/translate";
import { handStudyMessages } from "../../i18n/handStudyMessages";
import type { Locale, MessageParams } from "../../i18n/locales";
import { drawScene } from "./drawing";
import type { DrawingOptions, HandTreatment } from "./drawing";
import { STUDY_POSES } from "./poses";
import type { StudyPose } from "./poses";

let locale: Locale = "ru";
let selected = STUDY_POSES.find((pose) => pose.id === "triad") ?? STUDY_POSES[0];
let options: DrawingOptions = { treatment: "glass", hands: "both", opacity: 0.68, markers: true };
const storageKey = "hand-study-prefs-v1";
try {
  const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
  if (saved && typeof saved === "object") {
    const values = saved as Record<string, unknown>;
    if (values.locale === "en") locale = "en";
    if (typeof values.pose === "string") {
      selected = STUDY_POSES.find((pose) => pose.id === values.pose) ?? selected;
    }
    if (values.hands === "both" || values.hands === "right" || values.hands === "left")
      options = { ...options, hands: values.hands };
    if (
      values.treatment === "glass" ||
      values.treatment === "outline" ||
      values.treatment === "warm"
    )
      options = { ...options, treatment: values.treatment };
    if (typeof values.opacity === "number" && Number.isFinite(values.opacity))
      options = { ...options, opacity: Math.min(1, Math.max(0.2, values.opacity)) };
    if (typeof values.markers === "boolean") options = { ...options, markers: values.markers };
  }
} catch {
  // A local file can be opened in a browser that disallows storage.
}
const treatments: readonly { id: HandTreatment; name: string; hint: string }[] = [
  {
    id: "glass",
    name: "Холодное стекло",
    hint: "Контур и мягкие блики, близкие к текущим кистям."
  },
  { id: "outline", name: "Тонкий контур", hint: "Лёгкая заливка оставляет клавиши открытыми." },
  { id: "warm", name: "Тёплый объём", hint: "Мягкие тени и ногти придают кисти объём." }
];
const t = (message: string, params?: MessageParams) =>
  translate(locale, handStudyMessages, message, params);
const label = (pose: StudyPose) => t(pose.label, { fingers: pose.down.join("–") });

function element<T extends HTMLElement>(id: string, type?: new () => T): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing study element: ${id}`);
  if (type && !(node instanceof type)) throw new Error(`Unexpected study element: ${id}`);
  return node as T;
}

function renderArtwork(): void {
  if (!selected) return;
  const pose = selected;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...options, locale, pose: pose.id }));
  } catch {
    // The study still works when browser storage is unavailable.
  }
  element("pose-title").textContent = label(pose);
  element("treatment-number").textContent =
    `0${String(treatments.findIndex((item) => item.id === options.treatment) + 1)} / 03`;
  element("hero-scene").innerHTML = drawScene(pose, options, "hero");
  element("reference-scene").innerHTML = drawScene(
    pose,
    { ...options, treatment: "original" },
    "reference"
  );
  for (const treatment of treatments) {
    element(`scene-${treatment.id}`).innerHTML = drawScene(
      pose,
      { ...options, treatment: treatment.id },
      treatment.id
    );
    element(`treatment-${treatment.id}`).setAttribute(
      "aria-pressed",
      String(options.treatment === treatment.id)
    );
  }
  element("gallery").innerHTML = STUDY_POSES.map(
    (item, i) => `<button class="pose-card ${pose.id === item.id ? "selected" : ""}"
    data-pose="${item.id}" aria-pressed="${String(pose.id === item.id)}">
    ${drawScene(item, { ...options, hands: "right" }, `pose-${String(i)}`)}
    <span>${label(item)}</span></button>`
  ).join("");
  element("opacity-value").textContent = `${String(Math.round(options.opacity * 100))}%`;
}

function mount(): void {
  document.documentElement.lang = locale;
  document.title = t("Эскизы кистей");
  element("app").innerHTML = `<header><div><p class="eyebrow">${t("Эскизы кистей")} / SVG</p>
    <h1>${t("Кисти на нашей клавиатуре")}</h1><p class="intro">${t("Выберите позу и сравните три векторных оформления.")}</p></div>
    <button id="language" class="language">${locale === "ru" ? "EN" : "RU"}</button></header>
    <section class="controls">
      <label>${t("Поза кисти")}<select id="pose">${STUDY_POSES.map((pose) => `<option value="${pose.id}" ${selected?.id === pose.id ? "selected" : ""}>${label(pose)}</option>`).join("")}</select></label>
      <label>${t("Показать руки")}<select id="hands">
        ${(["both", "right", "left"] as const).map((value, i) => `<option value="${value}" ${options.hands === value ? "selected" : ""}>${t(["Обе кисти", "Только правую кисть", "Только левую кисть"][i] ?? "")}</option>`).join("")}
      </select></label>
      <label class="opacity">${t("Прозрачность кистей")} <span id="opacity-value"></span>
        <input id="opacity" type="range" min="20" max="100" value="${String(options.opacity * 100)}"/></label>
      <label class="checkbox"><input id="markers" type="checkbox" ${options.markers ? "checked" : ""}/>${t("Метки пальцев")}</label>
    </section>
    <section class="hero"><div class="scene-heading"><h2 id="pose-title"></h2><span id="treatment-number"></span></div>
      <div id="hero-scene" class="scene" aria-label="${t("Пример на нашей клавиатуре")}"></div></section>
    <section class="treatments">${treatments
      .map(
        (
          item,
          i
        ) => `<button id="treatment-${item.id}" class="treatment" data-treatment="${item.id}">
      <div class="card-heading"><span class="number">0${String(i + 1)}</span><h3>${t(item.name)}</h3></div>
      <div id="scene-${item.id}" class="scene"></div><p>${t(item.hint)}</p></button>`
      )
      .join("")}</section>
    <details class="reference"><summary>${t("Существующий спрайт")}</summary><div id="reference-scene" class="scene"></div>
      <p>${t("Для сравнения: исходное изображение кисти, без подгонки отдельных пальцев.")}</p></details>
    <section class="catalog"><p class="eyebrow">${t("Каталог поз кисти")} / ${String(STUDY_POSES.length)}</p>
      <h2>${t("Сочетания пальцев и варианты раскрытия")}</h2><p class="intro">${t("Нажмите на эскиз, чтобы рассмотреть позу крупнее.")}</p>
      <div id="gallery" class="gallery"></div></section>
    <footer>${t("Векторные эскизы для выбора внешнего вида. Аппликатура и анатомия требуют отдельной проверки перед внедрением.")}</footer>`;
  element("language").addEventListener("click", () => {
    locale = locale === "ru" ? "en" : "ru";
    mount();
  });
  element<HTMLSelectElement>("pose").addEventListener("change", (event) => {
    selected = STUDY_POSES.find(
      (pose) => pose.id === (event.currentTarget as HTMLSelectElement).value
    );
    renderArtwork();
  });
  element<HTMLSelectElement>("hands").addEventListener("change", (event) => {
    options = {
      ...options,
      hands: (event.currentTarget as HTMLSelectElement).value as DrawingOptions["hands"]
    };
    renderArtwork();
  });
  element<HTMLInputElement>("opacity").addEventListener("input", (event) => {
    options = {
      ...options,
      opacity: Number((event.currentTarget as HTMLInputElement).value) / 100
    };
    renderArtwork();
  });
  element<HTMLInputElement>("markers").addEventListener("change", (event) => {
    options = { ...options, markers: (event.currentTarget as HTMLInputElement).checked };
    renderArtwork();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-treatment]").forEach((button) => {
    button.addEventListener("click", () => {
      options = { ...options, treatment: button.dataset.treatment as HandTreatment };
      renderArtwork();
    });
  });
  element("gallery").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-pose]");
    if (!button) return;
    selected = STUDY_POSES.find((pose) => pose.id === button.dataset.pose);
    element<HTMLSelectElement>("pose").value = selected?.id ?? "relaxed";
    renderArtwork();
    element("hero-scene").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  renderArtwork();
}
mount();
