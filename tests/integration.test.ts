import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import test from "node:test";
import { SITE_ROOT } from "../lib/content.ts";

// Explicit test double for the HTTP contract; never imported by the application.
const rootPath = `${SITE_ROOT}/jcr:content/root`;
const component = {
  path: `${rootPath}/hero`, type: "hero", title: "Test HTTP depuis AEM",
  text: "Contenu du serveur de test", eyebrow: "TEST",
  linkLabel: "Nouvelle page", link: `${SITE_ROOT}/nouvelle`,
  image: "", imageAlt: "", theme: "blue", layout: ""
};

for (const mode of ["publish", "author"]) {
  test(`SSR ${mode} : transport AEM, routes, cache et instrumentation`, { timeout: 45000 }, async t => {
    let lastToken: string | null = null;
    const backend = createServer((request, response) => {
      const url = new URL(request.url!, "http://localhost");
      lastToken = url.searchParams.get("login-token");
      if (mode === "author" && lastToken !== "test-contributor") {
        response.writeHead(401).end();
        return;
      }
      if (url.pathname === "/content/dam/engie/photo.png") {
        response.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.from([137, 80, 78, 71]));
        return;
      }
      const path = url.pathname.replace(/\.engie\.json$/, "");
      if (![SITE_ROOT, `${SITE_ROOT}/nouvelle`].includes(path)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        path, title: "Test", rootPath: `${path}/jcr:content/root`,
        components: path === SITE_ROOT ? [component] : []
      }));
    });
    backend.listen(0, "127.0.0.1");
    await once(backend, "listening");
    t.after(() => new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve())));
    const aemPort = (backend.address() as AddressInfo).port;
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const child = spawn(process.execPath, [".next/standalone/server.js"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env, NEXT_TELEMETRY_DISABLED: "1",
        AEM_MODE: mode, AEM_ORIGIN: `http://localhost:${aemPort}`,
        HOSTNAME: "127.0.0.1", PORT: String(port)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", data => { output = (output + data).slice(-6000); });
    child.stderr.on("data", data => { output = (output + data).slice(-6000); });
    t.after(async () => {
      if (child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
    });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        ready = (await fetch(`${origin}/component-definition.json`)).ok;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error; // Connection refused while starting.
      }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, output);
    const query = mode === "author" ? "?login-token=test-contributor" : "";
    const response = await fetch(`${origin}/${query}`);
    const html = await response.text();
    assert.equal(response.status, 200, output);
    assert.ok(html.includes("Test HTTP depuis AEM"), output);
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const css = html.match(/href="([^"]+\.css(?:\?[^"]*)?)"/)?.[1];
    assert.ok(css, "CSS bundle absent");
    assert.equal((await fetch(new URL(css, origin))).status, 200);
    if (mode === "author") {
      assert.equal(lastToken, "test-contributor");
      assert.ok(html.includes(`urn:aemconnection:${rootPath}`));
      assert.ok(html.includes("component-definition.json"));
      assert.ok(html.slice(0, html.indexOf("</head>")).includes("application/vnd.adobe.aue.component+json"));
      assert.ok(html.includes("data-aue-filter"));
      const media = await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png&login-token=test-contributor`);
      assert.equal(media.status, 200);
      assert.equal(media.headers.get("content-type"), "image/png");
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png`)).status, 401);
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/private.png&login-token=test-contributor`)).status, 400);
      const unauthorized = await fetch(`${origin}/?login-token=invalid`);
      assert.ok(!(await unauthorized.text()).includes("Test HTTP depuis AEM</h1>"));
    } else {
      assert.equal(lastToken, null);
      assert.ok(!html.includes("data-aue-resource="));
      assert.ok(!html.includes("universal-editor-service.adobe.io"));
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png`)).status, 404);
    }
    const blank = await fetch(`${origin}${SITE_ROOT}/nouvelle${query}`);
    const blankHtml = await blank.text();
    assert.equal(blank.status, 200);
    assert.equal(blankHtml.includes("Votre page blanche"), mode === "author");
    assert.equal((await fetch(`${origin}/inexistante${query}`)).status, 404);
    assert.equal((await fetch(`${origin}/content/autre-site${query}`)).status, 404);
  });
}
