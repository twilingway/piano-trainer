import type { Locale } from "./locales.ts";

export const SITE_ORIGIN = "https://keys.twiling.ru";

export const SITE_METADATA = {
  ru: {
    name: "Нотопад",
    title: "Нотопад — игра и тренажёр фортепиано",
    description:
      "Нотопад — игра и тренажёр фортепиано в браузере: падающие ноты, подсказки пальцев и занятия с MIDI-пианино или компьютерной клавиатурой.",
    keywords:
      "Нотопад, фортепиано онлайн, тренажёр пианино, обучение фортепиано, падающие ноты, MIDI, MusicXML, аппликатура, клавиатурный тренажёр",
    socialDescription:
      "Попадай в ноты и учись играть: падающие ноты, подсказки пальцев, MIDI-пианино и компьютерная клавиатура.",
    image: "/social-card-ru-v3.png",
    imageAlt: "Нотопад: падающие ноты, обе руки над пианино и свечение нажатых клавиш",
    ogLocale: "ru_RU"
  },
  en: {
    name: "Twiling Keys",
    title: "Twiling Keys — piano game and trainer",
    description:
      "Twiling Keys is a browser piano game and trainer with falling notes, fingering hints, and practice using a MIDI piano or computer keyboard.",
    keywords:
      "Twiling Keys, online piano, piano trainer, learn piano, falling notes, MIDI, MusicXML, fingering, keyboard trainer",
    socialDescription:
      "Hit the notes and learn to play with falling notes, fingering hints, a MIDI piano, or your computer keyboard.",
    image: "/social-card-en-v3.png",
    imageAlt: "Twiling Keys: falling notes, both hands over a piano, and glowing pressed keys",
    ogLocale: "en_US"
  }
} as const;

/** Only the supported HTML entry points provide a language hint. */
export function siteLocaleFromPath(pathname: string): Locale | undefined {
  const match = /^\/(ru|en)(?:\/(?:index\.html)?)?$/.exec(pathname.split(/[?#]/)[0] ?? "");
  return match?.[1] as Locale | undefined;
}

export function canonicalSiteUrl(pathname: string): string {
  const language = siteLocaleFromPath(pathname);
  return `${SITE_ORIGIN}/${language ? `${language}/` : ""}`;
}

export interface SiteMetaTag {
  attribute: "name" | "property";
  key: string;
  content: string;
}

export function siteMetaTags(locale: Locale, pathname: string): SiteMetaTag[] {
  const metadata = SITE_METADATA[locale];
  const names = {
    description: metadata.description,
    keywords: metadata.keywords,
    "twitter:card": "summary_large_image",
    "twitter:title": metadata.title,
    "twitter:description": metadata.socialDescription,
    "twitter:image": SITE_ORIGIN + metadata.image,
    "twitter:image:alt": metadata.imageAlt
  };
  const properties = {
    "og:type": "website",
    "og:locale": metadata.ogLocale,
    "og:locale:alternate": SITE_METADATA[locale === "ru" ? "en" : "ru"].ogLocale,
    "og:site_name": metadata.name,
    "og:title": metadata.title,
    "og:description": metadata.socialDescription,
    "og:url": canonicalSiteUrl(pathname),
    "og:image": SITE_ORIGIN + metadata.image,
    "og:image:type": "image/png",
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:alt": metadata.imageAlt
  };
  return [
    ...Object.entries(names).map(([key, content]) => ({
      attribute: "name" as const,
      key,
      content
    })),
    ...Object.entries(properties).map(([key, content]) => ({
      attribute: "property" as const,
      key,
      content
    }))
  ];
}

export function siteLinks(pathname: string) {
  return [
    { rel: "canonical", href: canonicalSiteUrl(pathname), hreflang: "" },
    { rel: "alternate", href: `${SITE_ORIGIN}/ru/`, hreflang: "ru" },
    { rel: "alternate", href: `${SITE_ORIGIN}/en/`, hreflang: "en" },
    { rel: "alternate", href: `${SITE_ORIGIN}/`, hreflang: "x-default" }
  ];
}
