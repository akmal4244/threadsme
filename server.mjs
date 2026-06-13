import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = here;
const port = Number(process.env.SMTA_PORT || process.argv[2] || 80);
const host = process.env.SMTA_HOST || "0.0.0.0";
const publicPort = port === 80 ? "" : `:${port}`;

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

function resolveRequest(url) {
  const cleanPath = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const appPath = cleanPath.replace(/^\/smta(?=\/|$)/i, "").replace(/^\/mta(?=\/|$)/i, "") || "/";
  const normalized = appPath.endsWith("/") ? `${appPath}index.html` : appPath;
  const target = path.resolve(root, `.${normalized}`);
  if (!target.startsWith(root)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  try {
    const target = resolveRequest(req.url || "/");
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const info = await stat(target);
    const filePath = info.isDirectory() ? path.join(target, "index.html") : target;
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mime.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`SMTA listening at http://localhost${publicPort}/smta/`);
});
