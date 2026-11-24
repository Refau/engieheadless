import { cp, stat } from "node:fs/promises";

const server = new URL("../.next/standalone/server.js", import.meta.url);
const standalone = await stat(server).catch(error => {
  if (error.code !== "ENOENT") throw error;
  return null;
});

if (standalone) {
  await Promise.all([
    cp(new URL("../public", import.meta.url), new URL("../.next/standalone/public", import.meta.url), { recursive: true }),
    cp(new URL("../.next/static", import.meta.url), new URL("../.next/standalone/.next/static", import.meta.url), { recursive: true })
  ]);
} else {
  console.info("No standalone server generated; skipping standalone asset copy (managed builds such as Vercel).");
}
