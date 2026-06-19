import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stamp = Date.now();
const port = 9700 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const workspaceRoot = path.join(root, "work", `qa-flow-${stamp}`);
const runtimeRoot = path.join(workspaceRoot, "runtime");
const backupRoot = path.join(workspaceRoot, "backups");
const logRoot = path.join(runtimeRoot, "logs");
const adminPassword = "ThreadsMeFlow123!";
const adminUsername = "flowqa";
const productionUrl = "https://threadsme.akmalmarvis.com";

let cookie = "";
let csrfToken = "";
let sessionToken = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(file) {
  return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
}

function serverEnv() {
  return {
    ...process.env,
    NODE_ENV: "test",
    THREADSME_AI_PORT: String(port),
    THREADSME_AI_HOST: "127.0.0.1",
    THREADSME_WORKSPACE_ROOT: workspaceRoot,
    THREADSME_RUNTIME_DIR: runtimeRoot,
    THREADSME_BACKUP_DIR: backupRoot,
    THREADSME_LOG_DIR: logRoot,
    THREADSME_PUBLIC_URL: productionUrl,
    THREADSME_FORCE_HTTPS: "false",
    THREADSME_AUTH_REQUIRED: "true",
    THREADSME_ALLOWED_ORIGINS: productionUrl,
    THREADSME_AUTO_REGENERATE_LIMIT: "0",
    THREADSME_PUBLISH_PREFLIGHT_AI: "false",
    DEEPSEEK_API_KEY: "",
    DEEPSEEK_API_KEY_FILE: path.join(workspaceRoot, "private", "missing-deepseek.key"),
    SHOPEE_COOKIE: "",
    SHOPEE_COOKIE_FILE: path.join(workspaceRoot, "private", "shopee-cookie.txt"),
  };
}

function startServer() {
  const child = spawn(process.execPath, ["ai-server.mjs", String(port)], {
    cwd: root,
    env: serverEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  return { child, output: () => `${stdout}\n${stderr}`.trim() };
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null || server.child.signalCode) return;
  server.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.child.once("exit", resolve)),
    delay(4_000),
  ]);
  if (server.child.exitCode === null && !server.child.signalCode) server.child.kill("SIGKILL");
}

async function request(pathname, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.admin !== false && cookie && !headers.has("cookie") && !headers.has("authorization")) {
    headers.set("cookie", cookie);
  }
  const method = String(options.method || "GET").toUpperCase();
  if (options.admin !== false && csrfToken && method !== "GET" && method !== "HEAD" && !headers.has("x-threadsme-csrf")) {
    headers.set("x-threadsme-csrf", csrfToken);
  }
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { response, text, json };
}

async function waitForServer(server) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (server.child.exitCode !== null) throw new Error(`AI server keluar awal.\n${server.output()}`);
    try {
      const health = await request("/api/health", { admin: false });
      if (health.response.status === 200 && health.json?.ok) return;
    } catch {
      // Server masih bind port.
    }
    await delay(180);
  }
  throw new Error(`AI server tidak ready.\n${server.output()}`);
}

function parseCookie(response) {
  const raw = response.headers.get("set-cookie") || "";
  const match = raw.match(/tm_session=[^;]+/);
  assert(match, "Auth setup tidak pulangkan session cookie.");
  return { cookie: match[0], raw };
}

function flattenStatus(status = {}) {
  const keys = ["scheduled", "posted", "failed", "prepared", "remaining"];
  const owner = new Map();
  for (const key of keys) {
    for (const raw of status[key] || []) {
      const number = Number(raw);
      assert(Number.isInteger(number) && number > 0, `${key} mengandungi nombor tidak sah.`);
      assert(!owner.has(number), `Siri ${number} bertindih antara ${owner.get(number)} dan ${key}.`);
      owner.set(number, key);
    }
  }
  return owner;
}

async function seedEmptyRuntime() {
  await writeJson(path.join(runtimeRoot, "threads-schedule.json"), {
    timezone: "Asia/Kuala_Lumpur",
    affiliate_link: "",
    notes: "QA flow continuity",
    posts: [],
  });
  await writeJson(path.join(runtimeRoot, "status.json"), {
    systemStatus: "QA",
    systemNote: "QA flow continuity",
    scheduled: [],
    posted: [],
    failed: [],
    prepared: [],
    remaining: [],
    automationMode: true,
    automationLimit: 25,
  });
  await writeJson(path.join(runtimeRoot, "story-runs.json"), { runs: [] });
  await writeJson(path.join(runtimeRoot, "publish-log.json"), { entries: [] });
  await writeJson(path.join(runtimeRoot, "product-intel-cache.json"), { version: 1, entries: [] });
}

async function setupAuth() {
  const setup = await request("/api/auth/setup", {
    admin: false,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  assert(setup.response.status === 200 && setup.json?.authenticated, `Setup admin gagal: ${setup.text}`);
  const parsed = parseCookie(setup.response);
  assert(/;\s*Secure(?:;|$)/i.test(parsed.raw), "Cookie production mesti mempunyai atribut Secure.");
  cookie = parsed.cookie;
  csrfToken = String(setup.json.csrfToken || "");
  sessionToken = String(setup.json.sessionToken || "");
  assert(csrfToken && sessionToken, "CSRF atau bearer session token tiada selepas setup.");
}

async function generateBatch(versions) {
  const result = await request("/api/generate-story", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      productTitle: "Sambal Nyet Berapi 180g",
      productCategory: "sambal ready-to-eat, lauk cepat, penambah selera",
      sourceText: "Sambal untuk hari sibuk, nasi panas dan lauk ringkas.",
      imageNotes: "Produk sambal ready-to-eat untuk netizen Malaysia.",
      affiliateLink: "https://s.shopee.com.my/5q5IqSXkro",
      postsPerDay: 25,
      versions,
      productVerified: true,
      productIntelEvidence: "manual_verified",
      productIntelConfidence: 100,
      productIntelSource: "QA flow",
    }),
  });
  assert(result.response.status === 200 && result.json?.run, `Generate ${versions} versi gagal: ${result.text}`);
  assert(result.json.versions?.length === versions, `Generate sepatutnya pulangkan ${versions} versi.`);
  return result.json;
}

async function systemData() {
  const data = await request("/api/system-data");
  assert(data.response.status === 200 && data.json?.ok, `System data gagal: ${data.text}`);
  return data.json;
}

async function main() {
  await seedEmptyRuntime();
  let server = startServer();
  try {
    await waitForServer(server);

    const app = await request("/threadsme/", { admin: false });
    assert(app.response.status === 200 && /text\/html/i.test(app.response.headers.get("content-type") || ""), "Static UI AI server gagal.");
    assert(/frame-ancestors 'none'/.test(app.response.headers.get("content-security-policy") || ""), "CSP static UI tidak lengkap.");
    assert(/max-age=31536000/.test(app.response.headers.get("strict-transport-security") || ""), "HSTS production tidak aktif.");
    for (const blockedPath of ["/package.json", "/docs/OPERATION_RUNBOOK.md", "/work/private/deepseek.key", "/work/runtime/status.json", "/.git/config", "/status.json"]) {
      const blocked = await request(blockedPath, { admin: false });
      assert(blocked.response.status === 404, `${blockedPath} mesti pulang 404.`);
    }

    await setupAuth();

    const pairing = await request("/api/extension/pairing");
    assert(pairing.response.status === 200 && pairing.json?.bridge?.token, "Pairing extension gagal.");
    assert(pairing.json.bridge.bridgeUrl === productionUrl, "Bridge pairing mesti menggunakan THREADSME_PUBLIC_URL production.");
    const extensionToken = pairing.json.bridge.token;

    await generateBatch(25);
    await generateBatch(2);

    let data = await systemData();
    assert(data.schedule.posts.length === 27, "Jadual mesti mempunyai 27 siri selepas dua batch.");
    let owners = flattenStatus(data.status);
    assert(owners.size === 27, "Semua 27 siri mesti mempunyai tepat satu status queue.");
    assert((data.status.scheduled || []).length === 25, "Queue aktif mesti tepat 25 Pending.");
    assert((data.status.remaining || []).length + (data.status.prepared || []).length === 2, "Dua siri lebihan mesti kekal Blocked/Prepared.");

    const runsBeforeFail = await request("/api/story-runs");
    const versions = (runsBeforeFail.json?.runs || []).flatMap((run) => run.versions || []);
    const failedNumber = Number(data.status.scheduled[0]);
    const failedVersion = versions.find((version) => Number(version.scheduleNumber) === failedNumber);
    assert(failedVersion?.id, "Version ID untuk siri Pending tidak ditemui.");
    const failed = await request("/api/story-runs/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ versionId: failedVersion.id, status: "failed" }),
    });
    assert(failed.response.status === 200, `Mark Gagal gagal: ${failed.text}`);

    data = await systemData();
    owners = flattenStatus(data.status);
    assert(owners.get(failedNumber) === "failed", "Siri yang ditanda Gagal mesti kekal dalam failed sahaja.");
    assert((data.status.scheduled || []).length === 25, "Satu siri Blocked mesti auto-promote selepas slot Pending kosong.");

    const auditNumber = Number(data.status.scheduled[0]);
    const scheduleForAudit = await readJson(path.join(runtimeRoot, "threads-schedule.json"));
    scheduleForAudit.posts[auditNumber - 1].qualityReasons = ["stale reason QA"];
    await writeJson(path.join(runtimeRoot, "threads-schedule.json"), scheduleForAudit);
    const audit = await request("/api/product-audit/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        numbers: String(auditNumber),
        productTitle: "Sambal Nyet Berapi Premium 180g",
        productCategory: "sambal ready-to-eat, lauk cepat, penambah selera",
        affiliateLink: "https://s.shopee.com.my/5q5IqSXkro",
        note: "QA correction continuity",
      }),
    });
    assert(audit.response.status === 200, `Product Audit update gagal: ${audit.text}`);
    const afterAuditData = await systemData();
    assert(afterAuditData.schedule.posts[auditNumber - 1].productTitle === "Sambal Nyet Berapi Premium 180g", "Schedule tidak menerima tajuk Product Audit baharu.");
    assert(!(afterAuditData.schedule.posts[auditNumber - 1].qualityReasons || []).includes("stale reason QA"), "Quality reasons lama tidak dibersihkan selepas audit semula.");
    const afterAuditRuns = await request("/api/story-runs");
    const correctedRun = (afterAuditRuns.json?.runs || []).find((run) =>
      (run.versions || []).some((version) => Number(version.scheduleNumber) === auditNumber),
    );
    const correctedVersion = correctedRun?.versions?.find((version) => Number(version.scheduleNumber) === auditNumber);
    assert(correctedRun?.productTitle === "Sambal Nyet Berapi Premium 180g", "Run metadata tidak diselaraskan dengan Product Audit.");
    assert(correctedVersion?.productTitle === "Sambal Nyet Berapi Premium 180g", "Version metadata tidak diselaraskan dengan Product Audit.");

    data = await systemData();
    const proofNumber = Number((data.status.scheduled || []).find((number) => Number(number) !== auditNumber));
    assert(proofNumber, "Tiada siri Pending untuk ujian proof extension.");
    const pastSlot = "2020-01-01 08:00";
    const dueSchedule = await readJson(path.join(runtimeRoot, "threads-schedule.json"));
    dueSchedule.posts[proofNumber - 1].slot = pastSlot;
    await writeJson(path.join(runtimeRoot, "threads-schedule.json"), dueSchedule);

    const syncWithoutProof = await request("/api/automation/sync", { method: "POST" });
    assert(syncWithoutProof.response.status === 200, `Automation sync tanpa proof gagal: ${syncWithoutProof.text}`);
    data = await systemData();
    assert(!(data.status.posted || []).includes(proofNumber), "Slot lama tanpa proof tidak boleh menjadi Lulus.");

    const nativeSync = await request("/api/extension/sync", {
      admin: false,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${extensionToken}`,
        origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      body: JSON.stringify({
        account: "QA Threads",
        threadsConnected: true,
        nativeScheduledCount: 1,
        scheduledItems: [],
        scanReliable: true,
        scanNote: "QA global sync without per-series proof",
      }),
    });
    assert(nativeSync.response.status === 200, `Extension sync gagal: ${nativeSync.text}`);
    await request("/api/automation/sync", { method: "POST" });
    data = await systemData();
    assert(!(data.status.posted || []).includes(proofNumber), "Sync native global tanpa proof siri tidak boleh menjadi Lulus.");

    const proof = await request("/api/extension/proof", {
      admin: false,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${extensionToken}`,
        origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      body: JSON.stringify({
        number: proofNumber,
        slot: pastSlot,
        account: "QA Threads",
        proofText: `QA proof Siri ${proofNumber}`,
        nativeScheduledCount: 1,
      }),
    });
    assert(proof.response.status === 200, `Proof extension gagal: ${proof.text}`);
    await request("/api/automation/sync", { method: "POST" });
    await request("/api/automation/sync", { method: "POST" });
    data = await systemData();
    assert((data.status.posted || []).includes(proofNumber), "Siri dengan proof dan slot lepas mesti menjadi Lulus.");
    assert(data.status.publishResults?.[proofNumber]?.status === "native_schedule_assumed", "Proof native mesti dinormalisasi kepada native_schedule_assumed selepas slot lepas.");

    const publisherConfig = await request("/api/threads-publisher/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadsUserId: "qa-user",
        accessToken: "",
        enabled: true,
        dryRun: true,
        replyMode: "chain",
        publishDelaySeconds: 0,
        maxDuePerSync: 1,
      }),
    });
    assert(publisherConfig.response.status === 200 && publisherConfig.json?.config?.dryRun, "Publisher dry-run config gagal.");
    assert(publisherConfig.json.config.liveReady === false, "Publisher tanpa token tidak boleh liveReady.");
    const postedBeforeDryRun = (data.status.posted || []).length;
    const publisherRun = await request("/api/threads-publisher/run-due", { method: "POST" });
    assert(publisherRun.response.status === 200, `Publisher dry-run endpoint gagal: ${publisherRun.text}`);
    data = await systemData();
    assert((data.status.posted || []).length === postedBeforeDryRun, "Dry-run publisher tidak boleh menambah status Lulus.");

    const autoAudit = await request("/api/auto-audit/run", { method: "POST" });
    assert(autoAudit.response.status === 200 && autoAudit.json?.summary, `Auto Audit gagal: ${autoAudit.text}`);
    const health = await request("/api/automation-health");
    assert(health.response.status === 200 && health.json?.queue?.limit === 25, "Automation Health tidak bersambung dengan queue 25.");

    const backup = await request("/api/runtime-backup/snapshot", { method: "POST" });
    assert(backup.response.status === 200 && backup.json?.saved, `Runtime backup gagal: ${backup.text}`);
    assert(backup.json.backup?.version === "0.10.3", "Backup runtime mesti menggunakan versi 0.10.3.");
    assert(backup.json.backup?.schedule?.posts?.length === 27, "Backup tidak membawa keseluruhan schedule.");

    const snapshot = {
      posts: data.schedule.posts.length,
      posted: [...(data.status.posted || [])],
      failed: [...(data.status.failed || [])],
      correctedTitle: data.schedule.posts[auditNumber - 1].productTitle,
    };

    await stopServer(server);
    server = startServer();
    await waitForServer(server);
    cookie = "";
    csrfToken = "";
    const restored = await request("/api/system-data", {
      admin: false,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    assert(restored.response.status === 200 && restored.json?.schedule?.posts?.length === snapshot.posts, "Runtime tidak kekal selepas restart.");
    assert(restored.json.schedule.posts[auditNumber - 1].productTitle === snapshot.correctedTitle, "Metadata audit hilang selepas restart.");
    assert(snapshot.posted.every((number) => restored.json.status.posted.includes(number)), "Status Lulus berproof hilang selepas restart.");
    assert(snapshot.failed.every((number) => restored.json.status.failed.includes(number)), "Status Gagal hilang selepas restart.");

    const pairingAfterRestart = await request("/api/extension/pairing", {
      admin: false,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    assert(pairingAfterRestart.response.status === 200, "Pairing tidak boleh dibaca dengan session persisten selepas restart.");
    assert(pairingAfterRestart.json.bridge.bridgeUrl === productionUrl, "Bridge production hilang selepas restart.");
    assert(pairingAfterRestart.json.bridge.token === extensionToken, "Token pairing berubah tanpa sebab selepas restart.");

    console.log("Flow continuity QA passed");
  } finally {
    await stopServer(server);
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
