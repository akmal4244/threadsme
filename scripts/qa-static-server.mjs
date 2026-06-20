import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 18931 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    THREADSME_HOST: "127.0.0.1",
    THREADSME_PORT: String(port),
    THREADSME_HTTPS: "true",
    THREADSME_CSP_CONNECT_SRC: "https://api.example.test,not-a-url,ftp://bad.example",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

function stopServer() {
  if (!server.killed) server.kill("SIGTERM");
}

async function fetchWithTimeout(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    return await fetch(`${baseUrl}${pathname}`, {
      redirect: "manual",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 7000) {
    if (server.exitCode !== null) {
      throw new Error(`Static server exited early with code ${server.exitCode}.\n${output}`);
    }
    try {
      const response = await fetchWithTimeout("/threadsme/");
      if (response.ok) return response;
    } catch {
      // Retry until the server has bound the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Static server did not start in time.\n${output}`);
}

async function expectStatus(pathname, status, options = {}) {
  const response = await fetchWithTimeout(pathname, options);
  assert.equal(response.status, status, `${pathname} should return ${status}`);
  return response;
}

try {
  const index = await waitForServer();
  assert.match(index.headers.get("content-type") || "", /text\/html/i);
  assert.equal(index.headers.get("cache-control"), "no-store");
  assert.equal(index.headers.get("x-content-type-options"), "nosniff");
  assert.equal(index.headers.get("x-frame-options"), "DENY");
  assert.equal(index.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.match(index.headers.get("strict-transport-security") || "", /max-age=31536000/);
  assert.match(index.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(index.headers.get("content-security-policy") || "", /connect-src .*https:\/\/api\.example\.test/);
  assert.doesNotMatch(index.headers.get("content-security-policy") || "", /not-a-url|ftp:\/\/bad\.example/);
  const indexHtml = await index.text();
  assert.match(indexHtml, /config\.js\?v=4/, "index should load the current config cache-bust version");

  const app = await expectStatus("/threadsme/app.js?v=static-qa", 200);
  assert.match(app.headers.get("cache-control") || "", /immutable/);
  const etag = app.headers.get("etag");
  assert.ok(etag, "public assets should return an ETag");
  await expectStatus("/threadsme/app.js?v=static-qa", 304, { headers: { "if-none-match": etag } });

  const config = await expectStatus("/threadsme/config.js", 200);
  assert.equal(config.headers.get("cache-control"), "no-store");
  const configSource = await config.text();
  assert.match(configSource, /isProductionHost/, "config should separate production host detection from localhost");
  assert.match(configSource, /isLocalHost/, "config should explicitly protect localhost and loopback origins");
  assert.doesNotMatch(
    configSource,
    /host\s*===\s*["']threadsme\.akmalmarvis\.com["']\s*\|\|\s*host\s*===\s*["']localhost["']/,
    "localhost must not route to the production API by default",
  );

  await expectStatus("/threadsme/assets/threadsme-favicon.svg?v=static-qa", 200);
  await expectStatus("/threadsme/", 200, { method: "HEAD" });
  await expectStatus("/threadsme/app.js", 405, { method: "POST" });

  await expectStatus("/threadsme/package.json", 404);
  await expectStatus("/threadsme/docs/OPERATION_RUNBOOK.md", 404);
  await expectStatus("/threadsme/work/private/deepseek.key", 404);
  await expectStatus("/threadsme/work/runtime/status.json", 404);
  await expectStatus("/threadsme/.git/config", 404);
  await expectStatus("/threadsme/%2e%2e/package.json", 404);

  console.log("Static server QA passed.");
} finally {
  stopServer();
}
