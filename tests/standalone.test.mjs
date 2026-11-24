import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "engie-standalone-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  cpSync(new URL("../scripts/prepare-standalone.mjs", import.meta.url), join(root, "scripts/prepare-standalone.mjs"));
  return {
    root,
    run: () => spawnSync(process.execPath, ["scripts/prepare-standalone.mjs"], { cwd: root, encoding: "utf8" })
  };
}

test("postbuild skips managed builds without creating an incomplete standalone directory", t => {
  const { root, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No standalone server generated/);
  assert.equal(existsSync(join(root, ".next/standalone")), false);
});

test("postbuild copies public and static assets beside the standalone server", t => {
  const { root, run } = fixture(t);
  mkdirSync(join(root, ".next/standalone"), { recursive: true });
  mkdirSync(join(root, ".next/static"), { recursive: true });
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, ".next/standalone/server.js"), "");
  writeFileSync(join(root, ".next/static/app.css"), "body{}");
  writeFileSync(join(root, "public/component-definition.json"), "{}");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, ".next/standalone/.next/static/app.css"), "utf8"), "body{}");
  assert.equal(readFileSync(join(root, ".next/standalone/public/component-definition.json"), "utf8"), "{}");
});

test("postbuild does not hide missing assets when a standalone server exists", t => {
  const { root, run } = fixture(t);
  mkdirSync(join(root, ".next/standalone"), { recursive: true });
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, ".next/standalone/server.js"), "");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT/);
});
