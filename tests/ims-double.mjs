// Test-only preload: answers the Adobe IMS client_credentials call of the standalone server.
// It is passed with --import by the integration test and never bundled by the application.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== "https://ims-na1.adobelogin.com/ims/token/v3") return original(input, init);
  const body = new URLSearchParams(String(init?.body));
  const valid = init?.method === "POST" && body.get("grant_type") === "client_credentials" &&
    body.get("client_id") === "test-client" && body.get("client_secret") === "test-client-secret" &&
    body.get("scope") === "AdobeID,openid,read_pc.dma_aem_cloud";
  console.log(`IMS_DOUBLE_REQUEST valid=${valid}`);
  return valid
    ? Response.json({ access_token: "test-service", token_type: "bearer", expires_in: 86399 })
    : new Response("invalid_client", { status: 401 });
};
