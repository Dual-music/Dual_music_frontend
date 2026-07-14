/**
 * Composant SEO réutilisable : injecte title, meta description, OG/Twitter tags, canonical, JSON-
 * LD via react-helmet ou DOM head manipulation.
 */
import { Helmet } from "react-helmet-async";
import { useLanguage } from "@/contexts/LanguageContext";

const SITE_URL = "https://rhythm-remix-arena.lovable.app";
const DEFAULT_IMAGE = `${SITE_URL}/pwa-512x512.png`;

interface SEOProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article" | "video.other" | "profile";
  noindex?: boolean;
  jsonLd?: Record<string, any> | Record<string, any>[];
  keywords?: string;
}

const SEO = ({
  title,
  description,
  path = "",
  image = DEFAULT_IMAGE,
  type = "website",
  noindex = false,
  jsonLd,
  keywords,
}: SEOProps) => {
  const { language } = useLanguage();
  const fullTitle = title.length > 60 ? title.slice(0, 57) + "..." : title;
  const desc = description.length > 160 ? description.slice(0, 157) + "..." : description;
  const url = `${SITE_URL}${path}`;
  const frUrl = `${url}${path.includes("?") ? "&" : "?"}lang=fr`;
  const enUrl = `${url}${path.includes("?") ? "&" : "?"}lang=en`;
  const ogLocale = language === "en" ? "en_US" : "fr_FR";
  const htmlLang = language === "en" ? "en" : "fr";
  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <html lang={htmlLang} />
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {keywords && <meta name="keywords" content={keywords} />}
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <link rel="canonical" href={url} />

      {/* hreflang alternates for FR/EN targeting */}
      <link rel="alternate" hrefLang="fr" href={frUrl} />
      <link rel="alternate" hrefLang="en" href={enUrl} />
      <link rel="alternate" hrefLang="x-default" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="Dual Music" />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content={language === "en" ? "fr_FR" : "en_US"} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={image} />

      {ldArray.map((ld, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(ld)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEO;
