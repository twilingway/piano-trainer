import { translate } from "../../i18n/translate";
import { handStudyMessages } from "../../i18n/handStudyMessages";
import type { Locale, MessageParams } from "../../i18n/locales";
import { drawRenderScene } from "./drawing";
import renderPoses from "./renderPoses.json";
import { STUDY_POSES } from "./poses";
import type { StudyPose } from "./poses";

let locale: Locale = "ru";
let index = Math.max(
  0,
  STUDY_POSES.findIndex((pose) => pose.id === "triad")
);
const storageKey = "hand-study-prefs-v2";
try {
  const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
  if (saved && typeof saved === "object") {
    const values = saved as Record<string, unknown>;
    if (values.locale === "en") locale = "en";
    const found = STUDY_POSES.findIndex((pose) => pose.id === values.pose);
    if (found >= 0) index = found;
  }
} catch {
  // A local file can be opened in a browser that disallows storage.
}
const t = (message: string, params?: MessageParams) =>
  translate(locale, handStudyMessages, message, params);
const label = (pose: StudyPose) => t(pose.label, { fingers: pose.down.join("–") });
// Top-down renders of the posed 3D hand (Blender), next to the page in public/hand-study/, over the
// keys the solver pressed (tools/hand-rig/export.py writes both).
const renderKeys: Readonly<Record<string, Readonly<Record<string, number>>>> = renderPoses;
const renderScene = (pose: StudyPose) =>
  drawRenderScene(`hand-study/${pose.id}.webp`, renderKeys[pose.id], label(pose));

function element<T extends HTMLElement>(id: string, type?: new () => T): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing study element: ${id}`);
  if (type && !(node instanceof type)) throw new Error(`Unexpected study element: ${id}`);
  return node as T;
}

function show(next: number): void {
  index = (next + STUDY_POSES.length) % STUDY_POSES.length;
  const pose = STUDY_POSES[index];
  if (!pose) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ locale, pose: pose.id }));
  } catch {
    // The study still works when browser storage is unavailable.
  }
  element("pose-title").textContent = label(pose);
  element("pose-count").textContent = `${String(index + 1)} / ${String(STUDY_POSES.length)}`;
  element<HTMLSelectElement>("pose", HTMLSelectElement).value = pose.id;
  element("stage").innerHTML = renderScene(pose);
  element("renders").innerHTML = STUDY_POSES.map(
    (item, i) => `<button class="render-card ${i === index ? "selected" : ""}"
    data-pose="${item.id}" aria-pressed="${String(i === index)}">
    ${renderScene(item)}<span>${label(item)}</span></button>`
  ).join("");
}

function mount(): void {
  document.documentElement.lang = locale;
  document.title = t("Эскизы кистей");
  element("app").innerHTML = `<header><div><p class="eyebrow">${t("Эскизы кистей")} / 3D</p>
    <h1>${t("Кисти на нашей клавиатуре")}</h1><p class="intro">${t("Нажатые клавиши задаёт поза, свободные пальцы принимают естественное положение.")}</p></div>
    <button id="language" class="language">${locale === "ru" ? "EN" : "RU"}</button></header>
    <section class="slider">
      <div class="slider-bar"><h2 id="pose-title"></h2>
        <label class="pose-picker">${t("Поза кисти")}<select id="pose">${STUDY_POSES.map((pose) => `<option value="${pose.id}">${label(pose)}</option>`).join("")}</select></label>
        <span id="pose-count" class="count"></span></div>
      <div class="slider-body">
        <button id="previous" class="arrow" aria-label="${t("Предыдущая поза")}">‹</button>
        <div id="stage" class="stage" aria-live="polite"></div>
        <button id="next" class="arrow" aria-label="${t("Следующая поза")}">›</button>
      </div>
      <p class="hint">${t("Стрелки ← → на клавиатуре листают позы.")}</p>
    </section>
    <section class="catalog"><p class="eyebrow">${t("Рендеры 3D-модели")} / ${String(STUDY_POSES.length)}</p>
      <h2>${t("Позы, решённые на модели кисти")}</h2>
      <div id="renders" class="renders"></div></section>
    <footer>${t("3D-модель, вид сверху, правая кисть. Аппликатура и анатомия требуют отдельной проверки перед внедрением.")}</footer>`;
  element("language").addEventListener("click", () => {
    locale = locale === "ru" ? "en" : "ru";
    mount();
  });
  element("previous").addEventListener("click", () => {
    show(index - 1);
  });
  element("next").addEventListener("click", () => {
    show(index + 1);
  });
  element<HTMLSelectElement>("pose", HTMLSelectElement).addEventListener("change", (event) => {
    const id = (event.currentTarget as HTMLSelectElement).value;
    show(STUDY_POSES.findIndex((pose) => pose.id === id));
  });
  element("renders").addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-pose]");
    if (!button) return;
    show(STUDY_POSES.findIndex((pose) => pose.id === button.dataset.pose));
    element("stage").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  show(index);
}

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLSelectElement) return;
  if (event.key === "ArrowLeft") show(index - 1);
  if (event.key === "ArrowRight") show(index + 1);
});
mount();
