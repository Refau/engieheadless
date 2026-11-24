import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { pageSchema } from "./content";

export async function aemConfig() {
  const requestHeaders = await headers();
  const mode = process.env.AEM_MODE;
  if (mode !== "author" && mode !== "publish") throw new Error("AEM_MODE doit valoir author ou publish.");
  const author = mode === "author" || requestHeaders.get("x-engie-authoring") === "1";
  const variable = mode === "publish" && author ? "AEM_AUTHOR_ORIGIN" : "AEM_ORIGIN";
  const origin = process.env[variable];
  if (!origin) throw new Error(`${variable} est requis : configurer l'origine AEM réelle.`);
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) {
    throw new Error(`${variable} doit être une origine HTTPS sans chemin ni identifiants (HTTP localhost autorisé pour le SDK).`);
  }
  return { origin: url.origin, author };
}

export async function readPage(path: string, token?: string) {
  const config = await aemConfig();
  if (config.author && !token) throw new Error("Ouvrir cette page depuis AEM Sites : login-token contributeur manquant.");
  const endpoint = new URL(`${path}/jcr:content.engie.json`, config.origin);
  if (config.author && token) endpoint.searchParams.set("login-token", token);
  const response = await fetch(endpoint, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" }
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Lecture AEM impossible (HTTP ${response.status}). Vérifier droits, session et publication.`);
  const page = pageSchema.parse(await response.json());
  if (page.path !== path || page.rootPath !== `${path}/jcr:content/root`) {
    throw new Error("La projection AEM ne correspond pas à la page demandée.");
  }
  return { page, config };
}
