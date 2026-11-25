import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// AEM opens the editor with the long-lived bootstrap secret; the proxy immediately swaps it
// for a short-lived signed link token so the secret never appears in rendered links.
export const BOOTSTRAP_PARAM = "engie-preview";
export const DRAFT_PARAM = "engie-draft";
export const DRAFT_TTL_SECONDS = 8 * 60 * 60;

function previewSecret() {
  const value = process.env.AEM_PREVIEW_SECRET;
  return value && /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : undefined;
}

function same(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function signature(secret: string, expires: number) {
  return createHmac("sha256", secret).update(`engie-draft.v1.${expires}`).digest("base64url");
}

export function draftConfigured() {
  return previewSecret() !== undefined;
}

export function bootstrapValid(value: string) {
  const secret = previewSecret();
  return secret !== undefined && same(value, secret);
}

export function createDraftToken(now = Date.now()) {
  const secret = previewSecret();
  if (!secret) throw new Error("AEM_PREVIEW_SECRET est absent ou invalide.");
  const expires = Math.floor(now / 1000) + DRAFT_TTL_SECONDS;
  return `v1.${expires}.${signature(secret, expires)}`;
}

export function draftTokenValid(value: string | undefined, now = Date.now()) {
  const secret = previewSecret();
  const match = value ? /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(value) : null;
  if (!secret || !match) return false;
  const expires = Number(match[1]);
  const seconds = now / 1000;
  if (expires <= seconds || expires > seconds + DRAFT_TTL_SECONDS + 60) return false;
  return same(match[2], signature(secret, expires));
}
