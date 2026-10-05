import type { Locale } from "../i18n/locales";
import { SITE_METADATA, siteLinks, siteMetaTags } from "../i18n/siteMetadata";

/** Apply metadata only when the interface language changes, outside the practice clock. */
export function updateSiteMetadata(document: Document, locale: Locale, pathname: string): void {
  document.documentElement.lang = locale;
  document.title = SITE_METADATA[locale].title;
  for (const { attribute, key, content } of siteMetaTags(locale, pathname)) {
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    element.content = content;
  }
  for (const { rel, href, hreflang } of siteLinks(pathname)) {
    const selector = `link[rel="${rel}"]${hreflang ? `[hreflang="${hreflang}"]` : ""}`;
    let element = document.head.querySelector<HTMLLinkElement>(selector);
    if (!element) {
      element = document.createElement("link");
      element.rel = rel;
      if (hreflang) element.hreflang = hreflang;
      document.head.appendChild(element);
    }
    element.href = href;
  }
}
