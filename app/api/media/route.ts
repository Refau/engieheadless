import { aemConfig } from "../../../lib/aem";
import { damImage } from "../../../lib/content";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const tokens = query.getAll("login-token");
  const token = tokens.length === 1 ? tokens[0] : undefined;
  const config = await aemConfig();
  if (!config.author || config.publishedPreview) return new Response("Not found", { status: 404 });
  if (!token) return new Response("Session AEM requise", { status: 401 });
  const asset = damImage(query.get("path") ?? "", config.origin);
  if (!asset) return new Response("Chemin DAM invalide", { status: 400 });
  const endpoint = new URL(asset);
  endpoint.searchParams.set("login-token", token);
  const response = await fetch(endpoint, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return new Response("Image AEM indisponible", { status: response.status });
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!type || !["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(type)) {
    return new Response("Format image non pris en charge", { status: 415 });
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": type, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"
    }
  });
}
