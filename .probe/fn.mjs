// api/identify.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
var LAYERS = [
  "backgrounds",
  "skins",
  "clothing",
  "costumes",
  "chains",
  "accessories",
  "extras",
  "ears",
  "mouth",
  "eyes",
  "hair-headwear",
  "masks",
  "unsorted"
];
var Identified = z.object({
  name: z.string().describe("short kebab-case name, e.g. cross-chain or neet-bucket-hat"),
  layer: z.enum(LAYERS).describe("which layer this belongs on"),
  description: z.string().describe("one short sentence describing it"),
  confidence: z.enum(["high", "medium", "low"])
});
var Located = Identified.extend({
  box: z.object({
    x0: z.number().describe("left edge, 0-1 of image width"),
    y0: z.number().describe("top edge, 0-1 of image height"),
    x1: z.number().describe("right edge, 0-1 of image width"),
    y1: z.number().describe("bottom edge, 0-1 of image height")
  }).describe("tight box around the added item only, not the character"),
  reliable: z.boolean().describe("false if the item is hard to separate from the character")
});
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var hits = /* @__PURE__ */ new Map();
var WINDOW_MS = 6e4;
var MAX_PER_WINDOW = 8;
function overLimit(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}
var stripPrefix = (s) => s.replace(/^data:image\/\w+;base64,/, "");
async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  const ip = String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
  if (overLimit(ip)) {
    res.status(429).json({ error: "rate_limited", message: "Too many requests - wait a minute." });
    return;
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const mode = body?.mode === "locate" ? "locate" : "identify";
    const image = stripPrefix(String(body?.image ?? ""));
    if (!image) {
      res.status(400).json({ error: "bad_request", message: "No image supplied." });
      return;
    }
    if (Buffer.byteLength(image, "base64") > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: "too_large", message: "Image is over 4 MB." });
      return;
    }
    const client = new Anthropic();
    const img = { type: "image", source: { type: "base64", media_type: "image/png", data: image } };
    const prompt = mode === "locate" ? `This is a pixel-art character wearing or carrying one added item - a hat, necklace, backpack, glasses, or similar.

Identify the single added item and give a tight box around ONLY that item, in fractions of the image size.

The box must not include the character's head, torso or arms except where the item overlaps them. If the item is hard to separate from the body, set reliable to false rather than guessing a loose box.` : `This is a single pixel-art trait on a transparent background, cut out from a character.

Name it and choose the layer it belongs on.`;
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2e3,
      thinking: { type: "adaptive" },
      system: "You label pixel-art traits for an NFT collection. Names are short and kebab-case. Be literal about what is drawn; do not invent detail you cannot see.",
      messages: [{ role: "user", content: [img, { type: "text", text: prompt }] }],
      output_config: { format: zodOutputFormat(mode === "locate" ? Located : Identified) }
    });
    if (response.stop_reason === "refusal") {
      res.status(422).json({ error: "refused", message: "Claude declined to describe this image." });
      return;
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      res.status(502).json({ error: "unparsed", message: "No structured answer came back." });
      return;
    }
    res.status(200).json({
      ...parsed,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens }
    });
  } catch (err) {
    const status = err?.status ?? 500;
    const known = {
      400: "Claude rejected the request.",
      401: "The API key on the server is not valid.",
      429: "Claude is rate limiting - try again shortly.",
      529: "Claude is overloaded - try again shortly."
    };
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: "upstream", message: known[status] ?? "Could not reach Claude." });
  }
}
export {
  handler as default
};
