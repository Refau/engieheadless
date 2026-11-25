import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapValid, createDraftToken, draftConfigured, draftTokenValid, DRAFT_TTL_SECONDS } from "../lib/draft.ts";

const secret = "a".repeat(40);

test("le secret d'amorçage est requis, assez long et comparé exactement", () => {
  delete process.env.AEM_PREVIEW_SECRET;
  assert.equal(draftConfigured(), false);
  assert.equal(bootstrapValid(""), false);
  process.env.AEM_PREVIEW_SECRET = "court";
  assert.equal(draftConfigured(), false);
  assert.equal(bootstrapValid("court"), false);
  process.env.AEM_PREVIEW_SECRET = secret;
  assert.equal(bootstrapValid(secret), true);
  assert.equal(bootstrapValid(`${secret}b`), false);
});

test("le jeton de brouillon expire, ne révèle pas le secret et suit la rotation", () => {
  process.env.AEM_PREVIEW_SECRET = secret;
  const now = Date.UTC(2026, 0, 1);
  const token = createDraftToken(now);
  assert.ok(!token.includes(secret));
  assert.equal(draftTokenValid(token, now), true);
  assert.equal(draftTokenValid(token, now + (DRAFT_TTL_SECONDS - 1) * 1000), true);
  assert.equal(draftTokenValid(token, now + DRAFT_TTL_SECONDS * 1000), false);
  const [version, expires, signature] = token.split(".");
  assert.equal(draftTokenValid(`${version}.${Number(expires) + 3600}.${signature}`, now), false);
  assert.equal(draftTokenValid(`${version}.${expires}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`, now), false);
  assert.equal(draftTokenValid(undefined, now), false);
  process.env.AEM_PREVIEW_SECRET = "b".repeat(40);
  assert.equal(draftTokenValid(token, now), false);
});
