import "server-only";
import { notFound } from "next/navigation";
import { pageSchema } from "./content";

export function aemConfig() {
  const mode = process.env.AEM_MODE;
  if (mode !== "author" && mode !== "publish") throw new Error("AEM_MODE doit valoir author ou publish.");
  if (!process.env.AEM_ORIGIN) throw new Error("AEM_ORIGIN est requis : configurer l'origine AEM réelle.");
  const url = new URL(process.env.AEM_ORIGIN);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) {
    throw new Error("AEM_ORIGIN doit être une origine HTTPS sans chemin ni identifiants (HTTP localhost autorisé pour le SDK).");
  }
  return { origin: url.origin, author: mode === "author" };
}

export async function readPage(path: string, token?: string) {
  const config = aemConfig();
  if (config.author && !token) throw new Error("Ouvrir cette page depuis AEM Sites : login-token contributeur manquant.");
  const endpoint = new URL(`${path}.engie.json`, config.origin);
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
