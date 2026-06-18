import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = await realpath(here);
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
  [".ico", "image/x-icon"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".zip", "application/zip"],
]);

const publicRootFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "threads_flexi_marble_schedule.json",
  "status.json",
  "story-runs.json",
  "threadsme-extension.zip",
  "favicon.ico",
  "manifest.webmanifest",
  "robots.txt",
  "service-worker.js",
]);

function toPublicPath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function isPublicPath(relativePath) {
  if (!relativePath || relativePath === ".") return false;
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment.startsWith("."))) return false;
  return publicRootFiles.has(relativePath) || relativePath.startsWith("assets/");
}

function resolveRequest(url) {
  const requestUrl = new URL(url, `http://${host}:${port}`);
  const cleanPath = decodeURIComponent(requestUrl.pathname);
  const appPath = cleanPath.replace(/^\/threadsme(?=\/|$)/i, "") || "/";
  const normalized = appPath.endsWith("/") ? `${appPath}index.html` : appPath;
  const target = path.resolve(root, `.${normalized}`);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!isPublicPath(toPublicPath(target))) return null;
  return { target, requestUrl };
}

function parseConnectSources() {
  const sources = new Set([
    "'self'",
    "http://127.0.0.1:8788",
    "http://localhost:8788",
    "https://threadsme.akmalmarvis.com",
  ]);
  for (const value of String(process.env.THREADSME_CSP_CONNECT_SRC || "").split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (["http:", "https:"].includes(parsed.protocol)) sources.add(parsed.origin);
    } catch {
      // Ignore malformed values instead of placing unsafe text into a response header.
    }
  }
  return [...sources].join(" ");
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  `connect-src ${parseConnectSources()}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

function securityHeaders(req) {
  const headers = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": contentSecurityPolicy,
  };
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto === "https" || process.env.THREADSME_HTTPS === "true") {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

function cacheControl(filePath, requestUrl) {
  const relative = toPublicPath(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (relative === "index.html" || relative === "config.js" || extension === ".json") {
    return "no-store";
  }
  if (requestUrl.searchParams.has("v")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600, must-revalidate";
}

function sendText(req, res, statusCode, message, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...securityHeaders(req),
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(req.method === "HEAD" ? undefined : message);
}

const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method || "GET")) {
      sendText(req, res, 405, "Method not allowed", { allow: "GET, HEAD" });
      return;
    }

    const resolved = resolveRequest(req.url || "/");
    if (!resolved) {
      sendText(req, res, 404, "Not found");
      return;
    }

    const targetInfo = await stat(resolved.target);
    const filePath = targetInfo.isDirectory() ? path.join(resolved.target, "index.html") : resolved.target;
    const canonicalPath = await realpath(filePath);
    const canonicalRelative = path.relative(root, canonicalPath);
    if (
      canonicalRelative.startsWith("..")
      || path.isAbsolute(canonicalRelative)
      || !isPublicPath(toPublicPath(canonicalPath))
    ) {
      sendText(req, res, 404, "Not found");
      return;
    }

    const info = filePath === resolved.target ? targetInfo : await stat(canonicalPath);
    if (!info.isFile()) {
      sendText(req, res, 404, "Not found");
      return;
    }

    const etag = `W/\"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}\"`;
    const headers = {
      ...securityHeaders(req),
      "content-type": mime.get(path.extname(canonicalPath).toLowerCase()) || "application/octet-stream",
      "cache-control": cacheControl(canonicalPath, resolved.requestUrl),
      "last-modified": info.mtime.toUTCString(),
      etag,
    };

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(await readFile(canonicalPath));
  } catch {
    sendText(req, res, 404, "Not found");
  }
});

server.listen(port, host, () => {
  console.log(`ThreadsMe listening at http://localhost${publicPort}/threadsme/`);
});
