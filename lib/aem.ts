import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { pageSchema } from "./content";
import { DRAFT_PARAM, draftTokenValid } from "./draft";
import { forgetServiceAccessToken, serviceAccessToken } from "./ims";

export type Access = { token?: string; draft?: string };
export type AemConfig = Awaited<ReturnType<typeof aemConfig>>;

export async function aemConfig() {
  const requestHeaders = await headers();
  const mode = process.env.AEM_MODE;
  if (mode !== "author" && mode !== "publish") throw new Error("AEM_MODE doit valoir author ou publish.");
  const flag = requestHeaders.get("x-engie-authoring");
  const draft = flag === "draft";
  const publishedPreview = mode === "publish" && flag === "preview";
  const author = mode === "author" || flag === "1" || draft || publishedPreview;
  const variable = mode === "publish" && author && !publishedPreview ? "AEM_AUTHOR_ORIGIN" : "AEM_ORIGIN";
  const origin = serverOrigin(variable);
  const authorOrigin = author ? publishedPreview ? serverOrigin("AEM_AUTHOR_ORIGIN") : origin : undefined;
  return { origin, author, authorOrigin, publishedPreview, draft };
}

function serverOrigin(variable: string) {
  const origin = process.env[variable];
  if (!origin) throw new Error(`${variable} est requis : configurer l'origine AEM réelle.`);
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) {
    throw new Error(`${variable} doit être une origine HTTPS sans chemin ni identifiants (HTTP localhost autorisé pour le SDK).`);
  }
  return url.origin;
}

/** Parameter carried by site links so navigation stays in the same authoring mode. */
export function linkCarry(config: AemConfig, access: Access) {
  if (config.draft && access.draft) return { name: DRAFT_PARAM, value: access.draft };
  if (config.author && !config.publishedPreview && access.token) return { name: "login-token", value: access.token };
  if (config.publishedPreview) return { name: "ue", value: "1" };
  return undefined;
}

/** Fetches an AEM resource with the credentials matching the request mode. */
export async function aemFetch(config: AemConfig, endpoint: URL, access: Access, accept: string) {
  const requestHeaders: Record<string, string> = { Accept: accept };
  if (config.draft) {
    if (!draftTokenValid(access.draft)) throw new Error("Lien de brouillon expiré ou invalide : rouvrir la page depuis AEM Sites.");
    requestHeaders.Authorization = `Bearer ${await serviceAccessToken()}`;
  } else if (config.author && !config.publishedPreview) {
    if (!access.token) throw new Error("Ouvrir cette page depuis AEM Sites : login-token contributeur manquant.");
    endpoint.searchParams.set("login-token", access.token);
  }
  const response = await fetch(endpoint, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000), headers: requestHeaders
  });
  if (config.draft && response.status === 401) forgetServiceAccessToken();
  return response;
}

export async function readPage(path: string, access: Access) {
  const config = await aemConfig();
  const response = await aemFetch(config, new URL(`${path}/jcr:content.engie.json`, config.origin), access, "application/json");
  if (response.status === 404) notFound();
  if (!response.ok) {
    throw new Error(config.draft
      ? `Lecture du brouillon AEM impossible (HTTP ${response.status}). Vérifier les droits de lecture du compte technique.`
      : `Lecture AEM impossible (HTTP ${response.status}). Vérifier droits, session et publication.`);
  }
  const page = pageSchema.parse(await response.json());
  if (page.path !== path || page.rootPath !== `${path}/jcr:content/root`) {
    throw new Error("La projection AEM ne correspond pas à la page demandée.");
  }
  return { page, config };
}
