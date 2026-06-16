import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stamp = Date.now();
const port = 9600 + Math.floor(Math.random() * 300);
const baseUrl = `http://127.0.0.1:${port}`;
const workspaceRoot = path.join(root, "work", `qa-production-${stamp}`);
const runtimeRoot = path.join(workspaceRoot, "runtime");
const backupRoot = path.join(workspaceRoot, "backups");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs),
  ]);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill();
  await waitForChildExit(child);
  if (child.exitCode === null && !child.signalCode) {
    child.kill("SIGKILL");
    await waitForChildExit(child, 2_000);
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, text, json };
}

async function waitForServer(child) {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    if (child.exitCode !== null) break;
    try {
      const health = await request("/api/health");
      if (health.response.status === 200) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("Production safety server tidak ready.");
}

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie") || "";
  const match = cookie.match(/tm_session=[^;]+/);
  assert(match, "Session cookie tiada.");
  return match[0];
}

async function main() {
  await mkdir(runtimeRoot, { recursive: true });
  const child = spawn(process.execPath, ["ai-server.mjs", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      THREADSME_AI_PORT: String(port),
      THREADSME_WORKSPACE_ROOT: workspaceRoot,
      THREADSME_RUNTIME_DIR: runtimeRoot,
      THREADSME_BACKUP_DIR: backupRoot,
      THREADSME_LOG_DIR: path.join(runtimeRoot, "logs"),
      THREADSME_AUTH_REQUIRED: "true",
      THREADSME_ADMIN_PASSWORD: "ProductionSafety123!",
      THREADSME_ADMIN_USERNAME: "qa-admin",
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_API_KEY_FILE: path.join(workspaceRoot, "private", "missing.key"),
      THREADSME_ALLOWED_ORIGINS: "http://localhost,http://127.0.0.1",
    },
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(child);
    const unauthHealth = await request("/api/health");
    assert(unauthHealth.json?.authenticated === false, "Health unauth patut authenticated=false.");
    assert(!Object.prototype.hasOwnProperty.call(unauthHealth.json || {}, "hasKey"), "Health unauth tidak boleh dedah hasKey.");

    const lockedOps = await request("/api/ops-health");
    assert(lockedOps.response.status === 401, "Ops health mesti protected.");

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "qa-admin", password: "ProductionSafety123!" }),
    });
    assert(login.response.status === 200 && login.json?.authenticated, "Login env auth gagal.");
    const cookie = sessionCookie(login.response);
    const csrf = login.json.csrfToken;
    assert(csrf, "CSRF token tiada.");

    const ops = await request("/api/ops-health", { headers: { cookie } });
    assert(ops.response.status === 200 && ops.json?.runtime?.schedule?.validJson === true, "Ops health runtime invalid.");

    const liveConfig = await request("/api/threads-publisher/config", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-threadsme-csrf": csrf },
      body: JSON.stringify({ enabled: true, dryRun: false, threadsUserId: "123456", accessToken: "" }),
    });
    assert(liveConfig.response.status === 200, "Publisher config request gagal.");
    assert(liveConfig.json?.config?.liveReady === false, "Publisher tidak boleh liveReady tanpa token.");

    const runDue = await request("/api/threads-publisher/run-due", {
      method: "POST",
      headers: { cookie, "x-threadsme-csrf": csrf },
    });
    assert(runDue.response.status === 200 && runDue.json?.publisher?.liveReady === false, "Run due mesti safe bila token tiada.");

    const pairingCorsBlocked = await request("/api/extension/pairing", {
      headers: { origin: "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    });
    assert(pairingCorsBlocked.response.status === 403, "Extension origin tidak boleh baca pairing token.");

    const backup = await request("/api/runtime-backup/snapshot", {
      method: "POST",
      headers: { cookie, "x-threadsme-csrf": csrf },
    });
    assert(backup.response.status === 200 && backup.json?.saved, "Backup protected gagal.");

    console.log("Production safety QA passed");
  } finally {
    await stopChild(child);
    if (stderr.trim()) console.error(stderr.trim());
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
