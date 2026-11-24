import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { componentTypes, damImage, localLink, pagePath, pageSchema, safeLink, SITE_ROOT } from "../lib/content.ts";

test("les nouvelles pages et chemins de mapping AEM partagent le même routage", () => {
  assert.equal(pagePath(), SITE_ROOT);
  assert.equal(pagePath(["ma-nouvelle-page"]), `${SITE_ROOT}/ma-nouvelle-page`);
  assert.equal(pagePath(["content", "engie", "fr", "particuliers", "nouvelle", "enfant"]), `${SITE_ROOT}/nouvelle/enfant`);
  assert.equal(pagePath(["content", "other", "private"]), null);
  assert.equal(pagePath([".."]), null);
  assert.equal(pagePath(["page.engie.json"]), null);
});

test("les liens refusent les protocoles actifs et ne transmettent pas les sessions hors site", () => {
  for (const unsafe of ["javascript:alert(1)", "//other.invalid", "/\\other.invalid", "data:text/html,test", "https:\n//other.invalid"]) {
    assert.equal(safeLink(unsafe), undefined);
  }
  assert.equal(localLink(`${SITE_ROOT}/nouvelle#suite`, "session-test"), `${SITE_ROOT}/nouvelle?login-token=session-test#suite`);
  assert.equal(localLink("https://www.engie.fr/", "session-test"), "https://www.engie.fr/");
  assert.equal(localLink("/content/engie/fr/particuliers-autre", "session-test"), "/content/engie/fr/particuliers-autre");
});

test("la lecture média reste dans le DAM ENGIE", () => {
  assert.equal(damImage("/content/dam/engie/maison.jpg", "https://aem.invalid"), "https://aem.invalid/content/dam/engie/maison.jpg");
  for (const path of ["/content/dam/other/private.jpg", "/content/dam/engie/../private.jpg", "/content/dam/engie/%2e%2e/private.jpg", "/content/dam/engie/photo.jpg?x=1"]) {
    assert.equal(damImage(path, "https://aem.invalid"), undefined);
  }
});

test("UE expose exactement les composants rendus et des modèles/filtres valides", () => {
  const json = (file: string) => JSON.parse(readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8"));
  const definitions = json("component-definition.json").groups[0].components;
  const models = json("component-models.json");
  const filters = json("component-filters.json");
  assert.deepEqual(definitions.map((c: { id: string }) => c.id).sort(), componentTypes.map(type => `engie-${type}`).sort());
  for (const component of definitions) {
    assert.ok(models.some((model: { id: string }) => model.id === component.model));
    assert.equal(component.plugins.aem.page.resourceType, `adobedemoemea145program/components/engie/${component.id.slice(6)}`);
    if (component.filter) assert.ok(filters.some((filter: { id: string }) => filter.id === component.filter));
  }
  for (const filter of filters) {
    for (const id of filter.components) assert.ok(definitions.some((c: { id: string }) => c.id === id));
  }
});

test("une projection incompatible ne devient pas une fausse page vide", () => {
  assert.equal(pageSchema.safeParse({ title: "Test", components: [] }).success, false);
  assert.equal(pageSchema.safeParse({ path: SITE_ROOT, rootPath: `${SITE_ROOT}/jcr:content/root`, title: "Page blanche", components: [] }).success, true);
});
