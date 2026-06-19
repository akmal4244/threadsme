import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const workspace = path.join(projectRoot, "work", `qa-runtime-restore-${Date.now()}`);
const runtimeRoot = path.join(workspace, "runtime");
const backupRoot = path.join(workspace, "backups");
const sourceDir = path.join(backupRoot, "runtime-cli-fixture");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function runRestore(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/restore-runtime.mjs", ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        THREADSME_RUNTIME_DIR: runtimeRoot,
        THREADSME_BACKUP_DIR: backupRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  await mkdir(runtimeRoot, { recursive: true });
  await writeJson(path.join(runtimeRoot, "threads-schedule.json"), { timezone: "Asia/Kuala_Lumpur", posts: [{ slot: "2026-01-01 08:00", main: "old", reply1: "old", reply2: "old" }] });
  await writeJson(path.join(runtimeRoot, "status.json"), { scheduled: [1], posted: [], failed: [], prepared: [], remaining: [] });
  await writeJson(path.join(runtimeRoot, "story-runs.json"), { runs: [{ id: "old-run" }] });
  await writeJson(path.join(runtimeRoot, "publish-log.json"), { entries: [{ id: "old-log" }] });
  await writeJson(path.join(runtimeRoot, "product-intel-cache.json"), { version: 1, entries: [] });

  await mkdir(sourceDir, { recursive: true });
  await writeJson(path.join(sourceDir, "manifest.json"), { type: "threadsme-runtime-cli-backup" });
  await writeJson(path.join(sourceDir, "threads-schedule.json"), {
    timezone: "Asia/Kuala_Lumpur",
    posts: [
      { slot: "2026-06-18 08:00", main: "new 1", reply1: "reply", reply2: "cta" },
      { slot: "2026-06-18 09:00", main: "new 2", reply1: "reply", reply2: "cta" },
    ],
  });
  await writeJson(path.join(sourceDir, "status.json"), { scheduled: [1], posted: [2], failed: [], prepared: [], remaining: [] });
  await writeJson(path.join(sourceDir, "story-runs.json"), { runs: [{ id: "new-run" }] });
  await writeJson(path.join(sourceDir, "publish-log.json"), { entries: [{ id: "new-log" }] });
  await writeJson(path.join(sourceDir, "product-intel-cache.json"), { version: 1, entries: [{ key: "url:test", intel: { productTitle: "Produk QA" } }] });

  const dryRun = await runRestore(["--from", sourceDir]);
  assert(dryRun.code === 0, `Dry-run gagal: ${dryRun.stderr}`);
  assert(JSON.parse(dryRun.stdout).mode === "dry-run", "Dry-run tidak pulangkan mode yang betul.");
  assert((await readJson(path.join(runtimeRoot, "threads-schedule.json"))).posts[0].main === "old", "Dry-run tidak boleh ubah runtime.");

  const applied = await runRestore(["--apply", "--from", sourceDir]);
  assert(applied.code === 0, `Apply restore gagal: ${applied.stderr}`);
  const result = JSON.parse(applied.stdout);
  assert(result.mode === "applied", "Apply tidak pulangkan mode applied.");
  assert(result.counts.posts === 2, "Kiraan post restore tidak tepat.");
  assert((await readJson(path.join(runtimeRoot, "threads-schedule.json"))).posts[0].main === "new 1", "Runtime schedule tidak dipulihkan.");
  assert((await readJson(path.join(runtimeRoot, "story-runs.json"))).runs[0].id === "new-run", "Story runs tidak dipulihkan.");

  const backups = await readdir(backupRoot);
  const safetyDir = backups.find((name) => name.startsWith("runtime-pre-restore-"));
  assert(safetyDir, "Pre-restore backup tidak dicipta.");
  assert((await readJson(path.join(backupRoot, safetyDir, "threads-schedule.json"))).posts[0].main === "old", "Pre-restore backup tidak menyimpan runtime lama.");

  const invalidFile = path.join(backupRoot, "invalid.json");
  await writeJson(invalidFile, {
    type: "threadsme-runtime-backup",
    schedule: { posts: [] },
    status: { scheduled: [], posted: [], failed: [], prepared: [], remaining: [] },
    storyRuns: [],
    productIntelCache: { entries: [] },
    accessToken: "must-not-restore",
  });
  const invalid = await runRestore(["--apply", "--from", invalidFile]);
  assert(invalid.code !== 0, "Backup yang mengandungi secret mesti ditolak.");
  assert((await readJson(path.join(runtimeRoot, "threads-schedule.json"))).posts[0].main === "new 1", "Restore invalid tidak boleh ubah runtime.");

  const apiSnapshot = path.join(backupRoot, "threadsme-backup-fixture.json");
  await writeJson(apiSnapshot, {
    type: "threadsme-runtime-backup",
    schedule: { timezone: "Asia/Kuala_Lumpur", posts: [{ slot: "2026-07-01 10:00", main: "api", reply1: "reply", reply2: "cta" }] },
    status: { scheduled: [1], posted: [], failed: [], prepared: [], remaining: [] },
    storyRuns: [{ id: "api-run" }],
    productIntelCache: { version: 1, entries: [] },
    publisher: { lastEntries: [] },
    privateState: { deepseekKeyStored: true, shopeeCookieStored: false, threadsTokenStored: false },
  });
  const apiRestore = await runRestore(["--apply", "--from", apiSnapshot]);
  assert(apiRestore.code === 0, `API snapshot restore gagal: ${apiRestore.stderr}`);
  assert((await readJson(path.join(runtimeRoot, "threads-schedule.json"))).posts[0].main === "api", "API snapshot tidak dipulihkan.");

  console.log("Runtime restore QA passed");
}

main()
  .finally(() => rm(workspace, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
