import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const authoring = request.nextUrl.searchParams.has("login-token");
  const headers = new Headers(request.headers);
  headers.set("x-engie-authoring", authoring ? "1" : "0");
  const response = NextResponse.next({ request: { headers } });
  if (authoring) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
