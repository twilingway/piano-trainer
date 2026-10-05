import { REPOSITORY_URL } from "../../app/buildInfo";
import type { BuildInfo } from "../../app/buildInfo";

const AUTHOR_LINKS = [
  ["Telegram", "https://t.me/twilingkeys"],
  ["YouTube", "https://www.youtube.com/@twilinggame5959"],
  ["Rutube", "https://rutube.ru/channel/43554984/"],
  ["VK", "https://vk.ru/twilinggame"]
] as const;

const BUILT_AT = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });

function Version({ build }: { readonly build: BuildInfo }) {
  if (!build.sha) return <>локальная сборка</>;
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
  return (
    <div className="about">
      <section className="settings-group">
        <h3 className="settings-group__title">Пианино-тренажёр</h3>
        <p>
          Тренажёр, чтобы самостоятельно разучивать пьесы на фортепиано. Ноты падают на клавиши с
          подсказкой пальцев, сверху движется нотный стан, а каждый дубль записывается и
          сравнивается с нотами — видно, где ошибся.
        </p>
        <p>
          Играть можно на цифровом пианино через USB MIDI или на клавиатуре компьютера. Трудное
          место удобно учить по частям: игра ждёт нужную ноту, темп замедляется, а свои песни
          загружаются из MusicXML и MIDI.
        </p>
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">Сборка</h3>
        <dl className="about-build">
          <dt>Версия</dt>
          <dd>
            <Version build={build} />
          </dd>
          <dt>Собрано</dt>
          <dd>
            <time dateTime={build.builtAt}>{BUILT_AT.format(new Date(build.builtAt))}</time>
          </dd>
        </dl>
      </section>
      <section className="settings-group">
        <h3 className="settings-group__title">Автор</h3>
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
