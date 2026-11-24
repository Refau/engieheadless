import type { Metadata } from "next";
import Script from "next/script";
import { aemConfig } from "../lib/aem";
import EditorRefresh from "../components/EditorRefresh";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENGIE | Énergie et services pour les particuliers",
  description: "Électricité, gaz et solutions pour la maison : un site de démonstration éditoriale AEM."
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const author = process.env.AEM_MODE === "author";
  const origin = author ? aemConfig().origin : undefined;
  return <html lang="fr">
    <head>
      {author && <>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="urn:adobe:aue:system:aemconnection" content={`aem:${origin}`} />
        <script type="application/vnd.adobe.aue.component+json" src="/component-definition.json" />
        <script type="application/vnd.adobe.aue.model+json" src="/component-models.json" />
        <script type="application/vnd.adobe.aue.filter+json" src="/component-filters.json" />
      </>}
    </head>
    <body>
      {children}
      {author && <>
        <EditorRefresh />
        <Script src="https://universal-editor-service.adobe.io/cors.js" strategy="afterInteractive" />
      </>}
    </body>
  </html>;
}
