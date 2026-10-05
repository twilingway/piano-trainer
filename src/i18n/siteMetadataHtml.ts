import type { Locale } from "./locales.ts";
import { SITE_METADATA, siteLinks, siteMetaTags } from "./siteMetadata.ts";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Keep the application, fonts and production analytics outside the metadata section intact. */
export function renderSiteMetadataHtml(html: string, locale: Locale, pathname: string): string {
  const section = /<!-- site-metadata:start -->[\s\S]*?<!-- site-metadata:end -->/;
  if (!section.test(html)) throw new Error("The site metadata section is missing from index.html");
  const lines = [
    "<!-- site-metadata:start -->",
    `<title>${escapeHtml(SITE_METADATA[locale].title)}</title>`,
    ...siteMetaTags(locale, pathname).map(
      ({ attribute, key, content }) =>
        `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`
    ),
    ...siteLinks(pathname).map(
      ({ rel, href, hreflang }) =>
        `<link rel="${rel}"${hreflang ? ` hreflang="${hreflang}"` : ""} href="${escapeHtml(href)}" />`
    ),
    "<!-- site-metadata:end -->"
  ];
  return html
    .replace(/(<html\b[^>]*\blang=")[^"]*(")/, `$1${locale}$2`)
    .replace(section, () => lines.join("\n    "));
}
