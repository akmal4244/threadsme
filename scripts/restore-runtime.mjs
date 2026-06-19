import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runtimeRoot = path.resolve(process.env.THREADSME_RUNTIME_DIR || path.join(root, "work", "runtime"));
const backupRoot = path.resolve(process.env.THREADSME_BACKUP_DIR || path.join(root, "work", "backups"));
const runtimeFiles = [
  "threads-schedule.json",
  "status.json",
  "story-runs.json",
  "publish-log.json",
  "product-intel-cache.json",
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const args = { apply: false, source: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") args.apply = true;
    else if (value === "--from") args.source = argv[++index] || "";
    else if (!value.startsWith("-") && !args.source) args.source = value;
    else if (["-h", "--help"].includes(value)) args.help = true;
    else throw new Error(`Argumen tidak dikenali: ${value}`);
  }
  return args;
}

function usage() {
  return [
    "ThreadsMe Runtime Restore",
    "",
    "Dry-run (default):",
    "  node scripts/restore-runtime.mjs --from <backup-folder|snapshot.json|latest>",
    "",
    "Apply selepas semak dry-run:",
    "  node scripts/restore-runtime.mjs --apply --from <backup-folder|snapshot.json|latest>",
    "",
    "Tetapan env:",
    "  THREADSME_RUNTIME_DIR   folder runtime sasaran",
    "  THREADSME_BACKUP_DIR    folder backup dan pre-restore snapshot",
  ].join("\n");
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  const raw = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} mesti objek JSON.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} mesti array JSON.`);
}

function validateNumberList(value, label, maxNumber) {
  assertArray(value, label);
  const seen = new Set();
  for (const item of value) {
    const number = Number(item);
    if (!Number.isInteger(number) || number < 1) throw new Error(`${label} mengandungi nombor tidak sah: ${item}`);
    if (maxNumber > 0 && number > maxNumber) throw new Error(`${label} merujuk Siri ${number}, tetapi schedule hanya ada ${maxNumber} siri.`);
    if (seen.has(number)) throw new Error(`${label} mengandungi nombor berulang: ${number}`);
    seen.add(number);
  }
}

function hasUnsafeSecret(value, trail = []) {
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    const sensitive = /(^|_)(password|token|accessToken|apiKey|secret|cookie|bearerToken|refreshToken)$/i.test(key);
    if (sensitive && typeof item === "string" && item.trim()) return nextTrail.join(".");
    const nested = hasUnsafeSecret(item, nextTrail);
    if (nested) return nested;
  }
  return null;
}

function normalizePayload(payload) {
  if (payload?.type === "threadsme-runtime-backup") {
    return {
      format: "api-snapshot",
      files: {
        "threads-schedule.json": payload.schedule,
        "status.json": payload.status,
        "story-runs.json": { runs: Array.isArray(payload.storyRuns) ? payload.storyRuns : [] },
        "publish-log.json": { entries: Array.isArray(payload.publisher?.lastEntries) ? payload.publisher.lastEntries : [] },
        "product-intel-cache.json": payload.productIntelCache || { version: 1, entries: [] },
      },
    };
  }
  if (payload?.type === "threadsme-runtime-cli-backup" && payload.files) {
    return { format: "embedded-cli", files: payload.files };
  }
  throw new Error("Format snapshot JSON tidak dikenali.");
}

function validateRuntimeFiles(files) {
  const schedule = files["threads-schedule.json"];
  const status = files["status.json"];
  const storyRuns = files["story-runs.json"];
  const publishLog = files["publish-log.json"];
  const productCache = files["product-intel-cache.json"];

  assertObject(schedule, "threads-schedule.json");
  assertArray(schedule.posts, "threads-schedule.json.posts");
  schedule.posts.forEach((post, index) => {
    assertObject(post, `schedule post #${index + 1}`);
    if (post.slot !== undefined && typeof post.slot !== "string") {
      throw new Error(`schedule post #${index + 1}.slot mesti string.`);
    }
    ["main", "reply1", "reply2"].forEach((field) => {
      if (post[field] !== undefined && typeof post[field] !== "string") {
        throw new Error(`schedule post #${index + 1}.${field} mesti string.`);
      }
    });
  });

  assertObject(status, "status.json");
  ["scheduled", "posted", "failed", "prepared", "remaining"].forEach((key) => {
    validateNumberList(status[key] || [], `status.json.${key}`, schedule.posts.length);
  });

  assertObject(storyRuns, "story-runs.json");
  assertArray(storyRuns.runs, "story-runs.json.runs");
  storyRuns.runs.forEach((run, index) => assertObject(run, `story run #${index + 1}`));

  assertObject(publishLog, "publish-log.json");
  assertArray(publishLog.entries, "publish-log.json.entries");

  assertObject(productCache, "product-intel-cache.json");
  assertArray(productCache.entries, "product-intel-cache.json.entries");

  const unsafe = hasUnsafeSecret(files);
  if (unsafe) throw new Error(`Backup ditolak kerana mengandungi nilai secret pada ${unsafe}.`);

  return {
    posts: schedule.posts.length,
    pending: (status.scheduled || []).length,
    posted: (status.posted || []).length,
    failed: (status.failed || []).length,
    storyRuns: storyRuns.runs.length,
    publishEntries: publishLog.entries.length,
    productCacheEntries: productCache.entries.length,
  };
}

async function findLatestBackup() {
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("runtime-cli-") && !/^threadsme-backup-.*\.json$/i.test(entry.name)) continue;
    const full = path.join(backupRoot, entry.name);
    const info = await stat(full).catch(() => null);
    if (info) candidates.push({ full, mtime: info.mtimeMs });
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  if (!candidates[0]) throw new Error(`Tiada backup ditemui dalam ${backupRoot}.`);
  return candidates[0].full;
}

async function loadDirectoryBackup(directory) {
  const manifestFile = path.join(directory, "manifest.json");
  const manifest = (await exists(manifestFile)) ? await readJson(manifestFile) : {};
  const files = {};
  for (const file of runtimeFiles) {
    const source = path.join(directory, file);
    if (!(await exists(source))) {
      if (["threads-schedule.json", "status.json", "story-runs.json"].includes(file)) {
        throw new Error(`Backup tidak lengkap: ${file} tiada dalam ${directory}.`);
      }
      files[file] = file === "publish-log.json" ? { entries: [] } : { version: 1, entries: [] };
      continue;
    }
    files[file] = await readJson(source);
  }
  return {
    source: directory,
    format: manifest.type || "runtime-folder",
    files,
  };
}

async function loadBackup(sourceValue) {
  const source = sourceValue === "latest" ? await findLatestBackup() : path.resolve(sourceValue);
  const info = await stat(source).catch(() => null);
  if (!info) throw new Error(`Backup tidak ditemui: ${source}`);
  if (info.isDirectory()) return loadDirectoryBackup(source);
  if (!info.isFile()) throw new Error(`Sumber backup mesti fail JSON atau folder: ${source}`);
  const payload = await readJson(source);
  const unsafe = hasUnsafeSecret(payload);
  if (unsafe) throw new Error(`Backup ditolak kerana mengandungi nilai secret pada ${unsafe}.`);
  const normalized = normalizePayload(payload);
  return { source, ...normalized };
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

async function createPreRestoreBackup() {
  const directory = path.join(backupRoot, `runtime-pre-restore-${stamp()}`);
  await mkdir(directory, { recursive: true });
  const copied = [];
  for (const file of runtimeFiles) {
    const source = path.join(runtimeRoot, file);
    if (!(await exists(source))) continue;
    await copyFile(source, path.join(directory, file));
    copied.push(file);
  }
  await writeJsonAtomic(path.join(directory, "manifest.json"), {
    type: "threadsme-runtime-pre-restore-backup",
    createdAt: new Date().toISOString(),
    runtimeRoot,
    copied,
  });
  return { directory, copied };
}

async function applyRestore(files) {
  const safety = await createPreRestoreBackup();
  for (const file of runtimeFiles) {
    await writeJsonAtomic(path.join(runtimeRoot, file), files[file]);
  }
  for (const file of runtimeFiles) await readJson(path.join(runtimeRoot, file));
  return safety;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.source) {
    console.log(usage());
    if (!args.help) process.exitCode = 1;
    return;
  }

  const loaded = await loadBackup(args.source);
  const counts = validateRuntimeFiles(loaded.files);
  const result = {
    ok: true,
    mode: args.apply ? "applied" : "dry-run",
    source: loaded.source,
    format: loaded.format,
    runtimeRoot,
    backupRoot,
    files: runtimeFiles,
    counts,
    note: args.apply
      ? "Restore selesai. Restart AI server ThreadsMe dan semak /api/ops-health sebelum hidupkan publisher live."
      : "Dry-run sahaja. Tiada runtime diubah. Jalankan semula dengan --apply selepas semakan.",
  };

  if (args.apply) result.preRestoreBackup = await applyRestore(loaded.files);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
