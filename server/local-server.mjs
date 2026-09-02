import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPixelAgentService } from "./pixel-agent-service.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maxJsonBytes = 25 * 1024 * 1024;
const allowedGrids = new Set([32, 64, 128, 256]);
const allowedImageMimes = new Set(["image/png", "image/jpeg", "image/webp"]);
const staticTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

class RequestValidationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sendJson = (response, status, payload) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const isConnectionRefusal = (error) => {
  const seen = new Set();
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current);
    if (current.code === "ECONNREFUSED" || /ECONNREFUSED|connection refused/i.test(String(current.message))) {
      return true;
    }
  }
  return false;
};

const safeError = (error) => {
  if (isConnectionRefusal(error)) return [503, "ComfyUI is not running"];
  if (error instanceof RequestValidationError) return [error.statusCode, error.message];
  if (error instanceof RangeError) return [413, "Request payload is too large"];
  return [502, "Generation failed"];
};

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
    throw new RequestValidationError(415, "Expected application/json");
  }
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > maxJsonBytes) throw new RangeError("Request body exceeds 25 MiB");
  let size = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJsonBytes) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) throw new RangeError("Request body exceeds 25 MiB");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestValidationError(400, "Malformed JSON");
  }
}

function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestValidationError(400, "Malformed request");
  if (!allowedGrids.has(body.grid)) throw new RequestValidationError(400, "Unsupported working grid");
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.imageDataUrl || "");
  if (!match || match[2].length % 4 !== 0) throw new RequestValidationError(400, "Malformed image data");
  const type = match[1];
  if (!allowedImageMimes.has(type)) throw new RequestValidationError(415, "Unsupported image MIME type");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.toString("base64") !== match[2]) throw new RequestValidationError(400, "Malformed image data");
}

async function serveStatic(response, rootDir, pathname, method) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 404, { error: "Not found" });
    return;
  }
  const requested = decoded === "/" ? "index.html" : decoded.replace(/^[/\\]+/, "");
  const root = resolve(rootDir);
  const target = resolve(root, requested);
  if (!(target === root || target.startsWith(root + sep))) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!(realTarget === realRoot || realTarget.startsWith(realRoot + sep))) throw new Error("outside static root");
    if (!(await stat(realTarget)).isFile()) throw new Error("not a file");
    response.writeHead(200, { "content-type": staticTypes[extname(realTarget).toLowerCase()] || "application/octet-stream" });
    response.end(method === "HEAD" ? undefined : await readFile(realTarget));
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

export function createLocalServer({ service, rootDir = projectRoot } = {}) {
  if (!service) throw new TypeError("A pixel-agent service is required");
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const rawPathname = request.url.split("?", 1)[0];
    if (url.pathname === "/api/pixel-agent/health" && request.method === "GET") {
      try {
        sendJson(response, 200, await service.health());
      } catch (error) {
        const [status, message] = safeError(error);
        sendJson(response, status, { error: message });
      }
      return;
    }
    if (url.pathname === "/api/pixel-agent/generate" && request.method === "POST") {
      try {
        const body = await readJson(request);
        validateRequest(body);
        sendJson(response, 200, await service.generate(body));
      } catch (error) {
        const [fallbackStatus, message] = safeError(error);
        sendJson(response, fallbackStatus, { error: message });
      }
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    await serveStatic(response, rootDir, rawPathname, request.method);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const service = await createPixelAgentService({ rootDir: projectRoot });
  const server = createLocalServer({ service, rootDir: projectRoot });
  server.listen(4173, "127.0.0.1", () => {
    console.log("ChatNFT local pixel agent: http://127.0.0.1:4173/");
  });
}
