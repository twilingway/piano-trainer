import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { LOCALES, type Locale } from "../../i18n/locales";
import { useI18n } from "../../app/useI18n";
import { REPOSITORY_URL } from "../../app/buildInfo";
import type { BuildInfo } from "../../app/buildInfo";

const AUTHOR_LINKS = [
  ["Telegram", "https://t.me/twilingkeys"],
  ["YouTube", "https://www.youtube.com/@twilinggame"],
  ["Rutube", "https://rutube.ru/channel/43554984/"],
  ["VK", "https://vk.ru/twilinggame"]
] as const;

function Version({ build }: { readonly build: BuildInfo }) {
  const { t } = useI18n();
  if (!build.sha) return <>{t("локальная сборка")}</>;
  return (
    <>
      {build.pr !== null && (
        <>
          <a href={`${REPOSITORY_URL}/pull/${String(build.pr)}`} target="_blank" rel="noreferrer">
            #{build.pr}
          </a>
          {" · "}
        </>
      )}
      <a href={`${REPOSITORY_URL}/commit/${build.sha}`} target="_blank" rel="noreferrer">
        {build.sha.slice(0, 7)}
      </a>
    </>
  );
}

/** What the program is for, which build is open, and where the author publishes. */
export function AboutSettings({ build }: { readonly build: BuildInfo }) {
  const { t, locale, formatDate } = useI18n();
  return (
    <div className="about">
      <section className="settings-group">
        <label className="setting">
          <span>{t("Язык интерфейса")}</span>
          <select
            className="game-select"
            aria-label={t("Язык интерфейса")}
            value={locale}
            onChange={(event) => {
              setInterfaceLanguage(event.target.value as Locale);
            }}
          >
            {Object.entries(LOCALES).map(([id, language]) => (
              <option key={id} value={id}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Нотопад")}</h3>
        <p>
          {t(
            "Тренажёр, чтобы самостоятельно разучивать пьесы на фортепиано. Ноты падают на клавиши с подсказкой пальцев, сверху движется нотный стан, а каждый дубль записывается и сравнивается с нотами — видно, где ошибся."
          )}
        </p>
        <p>
          {t(
            "Играть можно на цифровом пианино через USB MIDI или на клавиатуре компьютера. Трудное место удобно учить по частям: игра ждёт нужную ноту, темп замедляется, а свои песни загружаются из MusicXML и MIDI."
          )}
        </p>
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Сборка")}</h3>
        <dl className="about-build">
          <dt>{t("Версия")}</dt>
          <dd>
            <Version build={build} />
          </dd>
          <dt>{t("Собрано")}</dt>
          <dd>
            <time dateTime={build.builtAt}>
              {formatDate(new Date(build.builtAt), { dateStyle: "short", timeStyle: "short" })}
            </time>
          </dd>
        </dl>
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">{t("Автор")}</h3>
        <ul className="about-links">
          {AUTHOR_LINKS.map(([name, url]) => (
            <li key={name}>
              <a href={url} target="_blank" rel="noreferrer">
                {name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
