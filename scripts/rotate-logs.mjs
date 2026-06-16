import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runtimeRoot = path.resolve(process.env.THREADSME_RUNTIME_DIR || path.join(root, "work", "runtime"));
const logRoot = path.resolve(process.env.THREADSME_LOG_DIR || path.join(runtimeRoot, "logs"));
const maxBytes = Math.max(64 * 1024, Math.min(Number(process.env.THREADSME_LOG_MAX_BYTES || 1_048_576), 20 * 1024 * 1024));
const backups = Math.max(1, Math.min(Number(process.env.THREADSME_LOG_BACKUPS || 5), 20));

async function rotate(file) {
  const info = await stat(file).catch(() => null);
  if (!info || info.size < maxBytes) return false;
  for (let index = backups; index >= 1; index -= 1) {
    const current = `${file}.${index}`;
    const next = `${file}.${index + 1}`;
    if (index === backups) {
      await unlink(current).catch(() => null);
      continue;
    }
    await rename(current, next).catch(() => null);
  }
  await rename(file, `${file}.1`);
  return true;
}

async function main() {
  await mkdir(logRoot, { recursive: true });
  const entries = await readdir(logRoot, { withFileTypes: true }).catch(() => []);
  const rotated = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.log$/i.test(entry.name)) continue;
    const file = path.join(logRoot, entry.name);
    if (await rotate(file)) rotated.push(entry.name);
  }
  console.log(JSON.stringify({ ok: true, logRoot, maxBytes, backups, rotated }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
