import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createPixelAgentService } from "./pixel-agent-service.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maxJsonBytes = 25 * 1024 * 1024;
const profileGrids = Object.freeze({
  standard: new Set([32, 64, 128, 256]),
  clothing: new Set([128, 256]),
  skins: new Set([160]),
});
const allowedImageMimes = new Set(["image/png", "image/jpeg", "image/webp"]);
const allowedSaveStatuses = new Set(["wip", "approved", "rejected"]);
const allowedSaveSizes = new Set([1024, 1280]);
const safeSaveSegment = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/;
const defaultOutputRoot = "E:\\X content\\pixel art_\\new-traits";
const defaultSkinMaskPath = join(projectRoot, "assets", "canonical-skin-mask-160.png");
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

const safeError = (error, fallbackMessage = "Generation failed", fallbackStatus = 502) => {
  if (isConnectionRefusal(error)) return [503, "ComfyUI is not running"];
  if (error instanceof RequestValidationError) return [error.statusCode, error.message];
  if (error instanceof RangeError) return [413, "Request payload is too large"];
  return [fallbackStatus, fallbackMessage];
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
  const profile = body.profile || "standard";
  if (!profileGrids[profile] || !profileGrids[profile].has(body.grid)) {
    throw new RequestValidationError(400, "Unsupported profile or working grid");
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.imageDataUrl || "");
  if (!match || match[2].length % 4 !== 0) throw new RequestValidationError(400, "Malformed image data");
  const type = match[1];
  if (!allowedImageMimes.has(type)) throw new RequestValidationError(415, "Unsupported image MIME type");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.toString("base64") !== match[2]) throw new RequestValidationError(400, "Malformed image data");
}

function validateSaveRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError(400, "Malformed request");
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.imageDataUrl || "");
  if (!match || match[1].length % 4 !== 0) {
    throw new RequestValidationError(400, "Malformed PNG data");
  }
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.toString("base64") !== match[1]) {
    throw new RequestValidationError(400, "Malformed PNG data");
  }
  const name = typeof body.name === "string" ? body.name.trim().replace(/\.png$/i, "") : "";
  const layer = typeof body.layer === "string" ? body.layer.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!safeSaveSegment.test(name) || !safeSaveSegment.test(layer) || !allowedSaveStatuses.has(status)) {
    throw new RequestValidationError(400, "Invalid save destination");
  }
  let image;
  try {
    image = PNG.sync.read(bytes);
  } catch {
    throw new RequestValidationError(400, "Invalid PNG");
  }
  if (image.width !== image.height || !allowedSaveSizes.has(image.width)) {
    throw new RequestValidationError(400, "PNG must be 1024x1024 or 1280x1280");
  }
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] !== 0 && image.data[offset] !== 255) {
      throw new RequestValidationError(400, "PNG alpha must be fully transparent or fully opaque");
    }
  }
  return { bytes, image, name, layer, status };
}

async function validateSkinSilhouette(image, skinMaskPath) {
  if (image.width !== 1280 || image.height !== 1280) {
    throw new RequestValidationError(400, "Skin PNG must match the canonical 160x160 body silhouette at exact 8x scale");
  }
  let mask;
  try {
    mask = PNG.sync.read(await readFile(skinMaskPath));
  } catch {
    throw new Error("Canonical skin mask is unavailable");
  }
  if (mask.width !== 160 || mask.height !== 160) throw new Error("Canonical skin mask is invalid");
  for (let cellY = 0; cellY < 160; cellY++) for (let cellX = 0; cellX < 160; cellX++) {
    const expectedAlpha = mask.data[(cellY * 160 + cellX) * 4 + 3] === 0 ? 0 : 255;
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 8; dx++) {
      const actualAlpha = image.data[((cellY * 8 + dy) * 1280 + cellX * 8 + dx) * 4 + 3];
      if (actualAlpha !== expectedAlpha) {
        throw new RequestValidationError(400, "Skin PNG must match the canonical 160x160 body silhouette at exact 8x scale");
      }
    }
  }
}

async function saveExactPng(body, outputRoot, skinMaskPath) {
  const { bytes, image, name, layer, status } = validateSaveRequest(body);
  if (layer === "skins") await validateSkinSilhouette(image, skinMaskPath);
  const root = resolve(outputRoot);
  const directory = resolve(root, layer, status);
  const target = resolve(directory, `${name}.png`);
  if (!directory.startsWith(root + sep) || !target.startsWith(directory + sep)) {
    throw new RequestValidationError(400, "Invalid save destination");
  }
  await mkdir(directory, { recursive: true });
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  if (!(realDirectory === realRoot || realDirectory.startsWith(realRoot + sep))) {
    throw new RequestValidationError(400, "Invalid save destination");
  }
  await writeFile(join(realDirectory, `${name}.png`), bytes);
  return {
    path: `${layer}/${status}/${name}.png`,
    width: image.width,
    height: image.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
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
    response.writeHead(200, {
      "content-type": staticTypes[extname(realTarget).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(method === "HEAD" ? undefined : await readFile(realTarget));
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

export function createLocalServer({
  service,
  rootDir = projectRoot,
  outputRoot = defaultOutputRoot,
  skinMaskPath = defaultSkinMaskPath,
} = {}) {
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
    if (url.pathname === "/api/pixel-agent/save" && request.method === "POST") {
      try {
        const body = await readJson(request);
        sendJson(response, 200, await saveExactPng(body, outputRoot, skinMaskPath));
      } catch (error) {
        const [fallbackStatus, message] = safeError(error, "Save failed", 500);
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
