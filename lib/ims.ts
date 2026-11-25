import "server-only";
import { z } from "zod";

// OAuth Server-to-Server credentials downloaded from the AEM Developer Console.
const credentialsSchema = z.object({
  imsEndpoint: z.string().regex(/^ims-[a-z0-9-]+\.adobelogin\.com$/),
  scopes: z.union([z.array(z.string().min(1)).min(1), z.string().min(1).transform(value => value.split(","))]),
  technicalAccount: z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) })
});
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });

// Next bundles this module once per route; share one token per server process.
const cache = ((globalThis as { [key: symbol]: unknown })[Symbol.for("engie.aem.s2s")] ??= {}) as {
  token?: { value: string; expires: number };
  pending?: Promise<string>;
};

function credentials() {
  const raw = process.env.AEM_S2S_CREDENTIALS;
  if (!raw) throw new Error("AEM_S2S_CREDENTIALS est requis pour lire les brouillons.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AEM_S2S_CREDENTIALS doit contenir le JSON OAuth Server-to-Server de l'AEM Developer Console.");
  }
  const wrapped = parsed as { integration?: unknown } | null;
  const result = credentialsSchema.safeParse(wrapped?.integration ?? parsed);
  if (!result.success) throw new Error("AEM_S2S_CREDENTIALS incomplet : imsEndpoint, scopes, clientId et clientSecret sont requis.");
  return result.data;
}

async function requestToken() {
  const { imsEndpoint, scopes, technicalAccount } = credentials();
  const response = await fetch(`https://${imsEndpoint}/ims/token/v3`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials", client_id: technicalAccount.clientId,
      client_secret: technicalAccount.clientSecret, scope: scopes.map(scope => scope.trim()).join(",")
    })
  });
  if (!response.ok) throw new Error(`Jeton technique AEM refusé par IMS (HTTP ${response.status}).`);
  const token = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!token.success) throw new Error("Réponse IMS invalide pour le jeton technique AEM.");
  // Refresh five minutes early so an in-flight AEM read never uses an expiring token.
  cache.token = { value: token.data.access_token, expires: Date.now() + Math.max(60, token.data.expires_in - 300) * 1000 };
  return cache.token.value;
}

export async function serviceAccessToken() {
  if (cache.token && cache.token.expires > Date.now()) return cache.token.value;
  cache.pending ??= requestToken().finally(() => { cache.pending = undefined; });
  return cache.pending;
}

export function forgetServiceAccessToken() {
  cache.token = undefined;
}
