import { aemConfig, aemFetch } from "../../../lib/aem";
import { damImage } from "../../../lib/content";
import { DRAFT_PARAM } from "../../../lib/draft";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const single = (name: string) => {
    const values = query.getAll(name);
    return values.length === 1 && values[0] ? values[0] : undefined;
  };
  const access = { token: single("login-token"), draft: single(DRAFT_PARAM) };
  const config = await aemConfig();
  if (!config.author || config.publishedPreview) return new Response("Not found", { status: 404 });
  if (!(config.draft ? access.draft : access.token)) return new Response("Session AEM requise", { status: 401 });
  const asset = damImage(query.get("path") ?? "", config.origin);
  if (!asset) return new Response("Chemin DAM invalide", { status: 400 });
  let response: Response;
  try {
    response = await aemFetch(config, new URL(asset), access, "image/*");
  } catch {
    return new Response("Image AEM indisponible", { status: 502 });
  }
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
