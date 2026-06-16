import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = here;
const port = Number(process.env.THREADSME_PORT || process.argv[2] || 80);
const host = process.env.THREADSME_HOST || "0.0.0.0";
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
  const appPath = cleanPath.replace(/^\/threadsme(?=\/|$)/i, "") || "/";
  const normalized = appPath.endsWith("/") ? `${appPath}index.html` : appPath;
  const target = path.resolve(root, `.${normalized}`);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method || "GET")) {
      res.writeHead(405, {
        "allow": "GET, HEAD",
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      res.end("Method not allowed");
      return;
    }

    const target = resolveRequest(req.url || "/");
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const info = await stat(target);
    const filePath = info.isDirectory() ? path.join(target, "index.html") : target;
    const relative = path.relative(root, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mime.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "content-security-policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; connect-src 'self' http://127.0.0.1:8788; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`ThreadsMe listening at http://localhost${publicPort}/threadsme/`);
});
