import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runtimeRoot = path.resolve(process.env.THREADSME_RUNTIME_DIR || path.join(root, "work", "runtime"));
const backupRoot = path.resolve(process.env.THREADSME_BACKUP_DIR || path.join(root, "work", "backups"));
const keep = Math.max(1, Math.min(Number(process.env.THREADSME_BACKUP_KEEP || 30), 365));

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(source, target) {
  if (!(await exists(source))) return false;
  await copyFile(source, target);
  return true;
}

async function countJsonArray(file, key) {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data?.[key])) return data[key].length;
  } catch {
    return 0;
  }
  return 0;
}

async function pruneOldBackups() {
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const backupDirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^runtime-cli-/.test(entry.name)) continue;
    const full = path.join(backupRoot, entry.name);
    const info = await stat(full).catch(() => null);
    if (info) backupDirs.push({ full, mtime: info.mtimeMs });
  }
  backupDirs.sort((a, b) => b.mtime - a.mtime);
  for (const old of backupDirs.slice(keep)) {
    await rm(old.full, { recursive: true, force: true });
  }
}

async function main() {
  const backupDir = path.join(backupRoot, `runtime-cli-${stamp()}`);
  await mkdir(backupDir, { recursive: true });

  const files = [
    "threads-schedule.json",
    "status.json",
    "story-runs.json",
    "publish-log.json",
    "product-intel-cache.json",
  ];
  const copied = [];
  for (const file of files) {
    const ok = await copyIfExists(path.join(runtimeRoot, file), path.join(backupDir, file));
    if (ok) copied.push(file);
  }

  const manifest = {
    type: "threadsme-runtime-cli-backup",
    createdAt: new Date().toISOString(),
    runtimeRoot,
    backupDir,
    copied,
    counts: {
      posts: await countJsonArray(path.join(runtimeRoot, "threads-schedule.json"), "posts"),
      storyRuns: await countJsonArray(path.join(runtimeRoot, "story-runs.json"), "runs"),
      publishEntries: await countJsonArray(path.join(runtimeRoot, "publish-log.json"), "entries"),
    },
    privateNote: "Secret files under work/private are intentionally not copied.",
  };
  await writeFile(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await pruneOldBackups();
  console.log(JSON.stringify({ ok: true, backupDir, copied, keep }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
