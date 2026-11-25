import { NextResponse, type NextRequest } from "next/server";
import { BOOTSTRAP_PARAM, bootstrapValid, createDraftToken, DRAFT_PARAM, draftConfigured, draftTokenValid } from "./lib/draft";

const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

function denied(status: number, message: string) {
  return new NextResponse(message, { status, headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

export function proxy(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.has(BOOTSTRAP_PARAM)) {
    const values = params.getAll(BOOTSTRAP_PARAM);
    if (!draftConfigured()) return denied(503, "Brouillons AEM non configurés sur ce déploiement.");
    if (values.length !== 1 || !bootstrapValid(values[0])) return denied(403, "Lien de brouillon AEM invalide.");
    // Swap the long-lived secret for a short-lived link token and drop it from the address bar.
    const target = request.nextUrl.clone();
    for (const name of [BOOTSTRAP_PARAM, "login-token", "ue"]) target.searchParams.delete(name);
    target.searchParams.set(DRAFT_PARAM, createDraftToken());
    const response = NextResponse.redirect(target, 303);
    Object.entries(privateHeaders).forEach(([name, value]) => response.headers.set(name, value));
    return response;
  }
  const draft = params.has(DRAFT_PARAM);
  if (draft && (params.getAll(DRAFT_PARAM).length !== 1 || params.has("login-token") || !draftTokenValid(params.get(DRAFT_PARAM)!))) {
    return denied(403, "Lien de brouillon AEM expiré ou invalide : rouvrez la page depuis AEM Sites > Modifier.");
  }
  const authoring = params.has("login-token");
  const publishedPreview = !draft && !authoring && params.get("ue") === "1";
  const headers = new Headers(request.headers);
  headers.set("x-engie-authoring", draft ? "draft" : authoring ? "1" : publishedPreview ? "preview" : "0");
  const response = NextResponse.next({ request: { headers } });
  if (draft || authoring || publishedPreview) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
