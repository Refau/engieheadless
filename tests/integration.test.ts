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
  image: "/content/dam/engie/photo.png", imageAlt: "Photo test", theme: "blue", layout: ""
};
const fragmentPath = "/content/dam/engie/offres/test";
const offer = {
  ...component, path: `${rootPath}/offer`, type: "offer", fragmentPath,
  fragment: {
    title: "Offre CF", description: "Contenu partage", badge: "TEST",
    link: `${SITE_ROOT}/nouvelle`, linkLabel: "Decouvrir", legal: ""
  }
};

for (const mode of ["publish", "author", "hybrid"]) {
  test(`SSR ${mode} : transport AEM, routes, cache et instrumentation`, { timeout: 45000 }, async t => {
    const authoring = mode !== "publish";
    let lastToken: string | null = null;
    const requests: { author: boolean; token: string | null }[] = [];
    const backends = [false, true].map(author => createServer((request, response) => {
      const url = new URL(request.url!, "http://localhost");
      lastToken = url.searchParams.get("login-token");
      requests.push({ author, token: lastToken });
      if (author && lastToken !== "test-contributor") {
        response.writeHead(401).end();
        return;
      }
      if (url.pathname === "/content/dam/engie/photo.png") {
        response.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.from([137, 80, 78, 71]));
        return;
      }
      const path = url.pathname.replace(/\/jcr:content\.engie\.json$/, "");
      if (![SITE_ROOT, `${SITE_ROOT}/nouvelle`].includes(path)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        path, title: "Test", rootPath: `${path}/jcr:content/root`,
        components: path === SITE_ROOT ? [{
          ...component, title: `${component.title} ${author ? "Author" : "Publish"}`
        }, offer] : []
      }));
    }));
    await Promise.all(backends.map(async backend => {
      backend.listen(0, "127.0.0.1");
      await once(backend, "listening");
      t.after(() => new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve())));
    }));
    const [publishOrigin, authorOrigin] = backends.map(backend =>
      `http://localhost:${(backend.address() as AddressInfo).port}`);
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const child = spawn(process.execPath, [".next/standalone/server.js"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env, NEXT_TELEMETRY_DISABLED: "1",
        AEM_MODE: mode === "hybrid" ? "publish" : mode,
        AEM_ORIGIN: mode === "author" ? authorOrigin : publishOrigin,
        AEM_AUTHOR_ORIGIN: mode === "hybrid" ? authorOrigin : "",
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
    const query = authoring ? "?login-token=test-contributor" : "";
    const response = await fetch(`${origin}/${query}`);
    const html = await response.text();
    assert.equal(response.status, 200, output);
    const expectedTitle = `${component.title} ${authoring ? "Author" : "Publish"}`;
    assert.ok(html.includes(expectedTitle), output);
    assert.equal(requests.at(-1)?.author, authoring);
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.ok(response.headers.get("content-security-policy")?.includes("https://experience.adobe.com"));
    assert.equal(response.headers.get("x-frame-options"), null);
    const css = html.match(/href="([^"]+\.css(?:\?[^"]*)?)"/)?.[1];
    assert.ok(css, "CSS bundle absent");
    assert.equal((await fetch(new URL(css, origin))).status, 200);
    if (authoring) {
      assert.equal(lastToken, "test-contributor");
      assert.ok(html.includes(`urn:aemconnection:${rootPath}`));
      assert.ok(html.includes(`urn:aemconnection:${fragmentPath}/jcr:content/data/master`));
      assert.ok(html.includes("component-definition.json"));
      assert.ok(html.slice(0, html.indexOf("</head>")).includes("application/vnd.adobe.aue.component+json"));
      assert.ok(html.includes("data-aue-filter"));
      assert.ok(html.includes(`aem:${authorOrigin}`));
      assert.ok(html.includes("universal-editor-service.adobe.io/cors.js"));
      assert.ok(html.includes(`${SITE_ROOT}/nouvelle?login-token=test-contributor`));
      const media = await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png&login-token=test-contributor`);
      assert.equal(media.status, 200);
      assert.equal(media.headers.get("content-type"), "image/png");
      assert.ok(media.headers.get("cache-control")?.includes("no-store"));
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png`)).status, mode === "author" ? 401 : 404);
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/private.png&login-token=test-contributor`)).status, 400);
      const previousReads = requests.length;
      const unauthorized = await fetch(`${origin}/?login-token=invalid`);
      assert.ok(!(await unauthorized.text()).includes(expectedTitle));
      assert.deepEqual(requests.slice(previousReads), [{ author: true, token: "invalid" }]);
      if (mode === "author") {
        const readsBeforeMissingToken = requests.length;
        for (const path of ["/", "/?ue=1"]) {
          const missingToken = await fetch(`${origin}${path}`);
          assert.ok(!(await missingToken.text()).includes(expectedTitle));
        }
        assert.equal(requests.length, readsBeforeMissingToken);
      }
    } else {
      assert.equal(lastToken, null);
      assert.ok(!html.includes("data-aue-resource="));
      assert.ok(!html.includes("universal-editor-service.adobe.io"));
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png`)).status, 404);
      const previousReads = requests.length;
      const missingAuthorConfig = await fetch(`${origin}/?login-token=test-contributor`);
      assert.ok(!(await missingAuthorConfig.text()).includes(expectedTitle));
      assert.equal(requests.length, previousReads);
      const missingPreviewConfig = await fetch(`${origin}/?ue=1`);
      assert.ok(!(await missingPreviewConfig.text()).includes(expectedTitle));
      assert.equal(requests.length, previousReads);
    }
    const blank = await fetch(`${origin}${SITE_ROOT}/nouvelle${query}`);
    const blankHtml = await blank.text();
    assert.equal(blank.status, 200);
    assert.equal(blankHtml.includes("Votre page blanche"), authoring);
    assert.equal((await fetch(`${origin}/inexistante${query}`)).status, 404);
    assert.equal((await fetch(`${origin}/content/autre-site${query}`)).status, 404);
    if (mode === "hybrid") {
      const previousReads = requests.length;
      for (const invalidQuery of ["?login-token=", "?login-token=test-contributor&login-token=invalid", "?ue=1&login-token="]) {
        const invalid = await fetch(`${origin}/${invalidQuery}`);
        const invalidHtml = await invalid.text();
        assert.ok(!invalidHtml.includes(`${component.title} Author`));
        assert.ok(!invalidHtml.includes(`${component.title} Publish`));
      }
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png&login-token=`)).status, 401);
      assert.equal((await fetch(`${origin}/api/media?path=/content/dam/engie/photo.png&login-token=test-contributor&login-token=invalid`)).status, 401);
      assert.equal(requests.length, previousReads);
      const [visitor, editor, preview] = await Promise.all([
        fetch(`${origin}/`, { headers: { "x-engie-authoring": "preview" } }),
        fetch(`${origin}/${query}`, { headers: { "x-engie-authoring": "0" } }),
        fetch(`${origin}/?ue=1`)
      ]);
      const [visitorHtml, editorHtml, previewHtml] = await Promise.all([visitor.text(), editor.text(), preview.text()]);
      assert.equal(visitor.status, 200);
      assert.ok(visitorHtml.includes(`${component.title} Publish`));
      assert.ok(!visitorHtml.includes("data-aue-resource="));
      assert.ok(!visitorHtml.includes("urn:adobe:aue:system:aemconnection"));
      assert.ok(!visitorHtml.includes("universal-editor-service.adobe.io"));
      assert.equal(editor.status, 200);
      assert.ok(editorHtml.includes(`${component.title} Author`));
      assert.ok(editorHtml.includes(`aem:${authorOrigin}`));
      assert.ok(editorHtml.includes("data-aue-resource="));
      assert.equal(preview.status, 200);
      assert.ok(previewHtml.includes(`${component.title} Publish`));
      assert.ok(!previewHtml.includes(`${component.title} Author`));
      assert.ok(previewHtml.includes("Les brouillons ne sont pas"));
      assert.ok(previewHtml.includes(`aem:${authorOrigin}`));
      assert.ok(previewHtml.includes(`urn:aemconnection:${rootPath}`));
      assert.ok(previewHtml.includes(`urn:aemconnection:${fragmentPath}/jcr:content/data/master`));
      assert.ok(previewHtml.includes("component-definition.json"));
      assert.ok(previewHtml.includes("universal-editor-service.adobe.io/cors.js"));
      assert.ok(previewHtml.includes(`${publishOrigin}/content/dam/engie/photo.png`));
      assert.ok(!previewHtml.includes("/api/media?"));
      assert.ok(!previewHtml.includes("login-token="));
      assert.ok(previewHtml.includes(`${SITE_ROOT}/nouvelle?ue=1`));
      assert.ok(preview.headers.get("cache-control")?.includes("no-store"));
      const readsBeforePreview = requests.length;
      const previewNavigation = await fetch(`${origin}${SITE_ROOT}/nouvelle?ue=1`);
      assert.equal(previewNavigation.status, 200);
      assert.deepEqual(requests.slice(readsBeforePreview), [{ author: false, token: null }]);
      const readsBeforeInvalid = requests.length;
      const invalidPreview = await fetch(`${origin}/?ue=1&login-token=invalid`);
      assert.ok(!(await invalidPreview.text()).includes(`${component.title} Publish`));
      assert.deepEqual(requests.slice(readsBeforeInvalid), [{ author: true, token: "invalid" }]);
    }
    assert.ok(requests.filter(request => !request.author).every(request => request.token === null));
  });
}
