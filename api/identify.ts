/**
 * Ask Claude what a trait is.
 *
 * This runs server-side for one reason: the API key must never reach the
 * browser. A public page that carries a key lets anyone spend the owner's
 * credits, and minifying or obfuscating it changes nothing - it still has to
 * be in the bundle to be used. So the key lives in a Vercel environment
 * variable and only this function sees it.
 *
 * Two modes:
 *   identify - given a trait already cut out on transparency, name it and pick
 *              a layer, so saving to the project is one click.
 *   locate   - given a whole character with no reference to diff against, find
 *              what was added and return where it sits. This is a best guess
 *              from vision, not a measurement: with a reference, differencing
 *              is exact and should always be preferred.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/* THE SAME FOURTEEN AS index.html's DEFAULT_LAYERS, and it has to be: this is
   a z.enum, so a name missing here is a layer the model can never answer,
   and a retired name present here is a layer the save path would adopt
   back. patch516.

   Now only the fallback. A project's layers are editable - renamed, added,
   removed, adopted from a group - and a fixed list meant a project that had
   renamed hats to headwear could only ever be told "hats", which the page
   could not select, so the trait saved as unsorted under a toast saying it
   had been found. The page sends its live list and the enum is built from
   it per request (patch554). */
const LAYERS = [
  "backgrounds", "skins", "mouth", "eyes", "clothing", "chains", "hair",
  "glasses", "hats", "ears", "costumes", "masks", "extras", "unsorted",
] as const;

/* The page's list, checked: strings of 1-40 characters, at most 64 of them,
   no repeats. Anything else and the fixed fourteen are used - a malformed
   list is a page bug, not a reason to refuse a paid call. */
function layersFrom(v: unknown): [string, ...string[]] {
  if (!Array.isArray(v)) return [...LAYERS];
  const out: string[] = [];
  for (const s of v) {
    if (typeof s !== "string") return [...LAYERS];
    const t = s.trim();
    if (!t || t.length > 40) return [...LAYERS];
    if (!out.includes(t)) out.push(t);
  }
  if (!out.length || out.length > 64) return [...LAYERS];
  return out as [string, ...string[]];
}

function shapes(layers: [string, ...string[]]) {
  const Identified = z.object({
    name: z.string().describe("short kebab-case name, e.g. cross-chain or neet-bucket-hat"),
    layer: z.enum(layers).describe("which layer this belongs on"),
    description: z.string().describe("one short sentence describing it"),
    confidence: z.enum(["high", "medium", "low"]),
  });
  const Located = Identified.extend({
    box: z.object({
      x0: z.number().describe("left edge, 0-1 of image width"),
      y0: z.number().describe("top edge, 0-1 of image height"),
      x1: z.number().describe("right edge, 0-1 of image width"),
      y1: z.number().describe("bottom edge, 0-1 of image height"),
    }).describe("tight box around the added item only, not the character"),
    reliable: z.boolean().describe("false if the item is hard to separate from the character"),
  });
  return { Identified, Located };
}

/* DEADLINES. Nothing bounded this call: the sign-in check and the model
   request could each wait until the platform killed the function, and the
   page sat on "Looking..." for all of it (measured past 45 s). The page
   gives up at 60 s; everything here finishes inside that. One attempt at
   the model, because a retry after 45 s would outlive the page's wait - an
   overloaded answer says "try again shortly" instead. */
const AUTH_DEADLINE_MS = 5_000;
const MODEL_DEADLINE_MS = 45_000;

/* max_tokens bounds thinking AND the answer together on this model. At 2,000
   a long think was cut off and came back as "No structured answer" or, cut
   mid-answer, as "Could not reach Claude" - paid for and unreadable. The
   answer is a few dozen tokens; this is room to think. */
const MAX_TOKENS = 16_000;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/* A public endpoint that spends money needs a brake. This is per-instance and
   therefore leaky - serverless spins up many - but it stops one tab hammering
   the endpoint, which is the realistic failure. Durable limiting needs a shared
   store; say so rather than implying this is airtight. */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
function overLimit(who: string): boolean {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(who, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

/* Who is calling.

   This endpoint spends the owner's Anthropic credit, and until now it spent it
   for anyone who found the URL: no key, no token, no account. The only brake
   was the per-instance IP limit above, which the comment there already admits
   is leaky.

   The page has a sign-in wall, but a wall drawn in CSS is not a wall to anyone
   holding curl. This is the one place in this project where "you must be
   signed in" can actually be ENFORCED rather than displayed, because it runs
   somewhere the caller cannot edit.

   The token is checked against Supabase rather than verified locally. Local
   verification needs the project's JWT secret in another environment variable
   and gets signature checking subtly wrong more often than not; this costs one
   round trip on a request that is about to spend several seconds talking to
   Claude, and it also honours a sign-out immediately instead of trusting an
   unexpired token. Both values below are the ones already public in index.html
   - the publishable key identifies the project and grants nothing on its own. */
const SB_URL = process.env.SUPABASE_URL ?? "https://dpracoavrcqyenfieksi.supabase.co";
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_DipQjG9YE0KZDu10-FvfPQ_Nsmt14bM";

async function callerId(req: any): Promise<string | null> {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization ?? "").trim());
  if (!m) return null;
  try {
    const r = await fetch(SB_URL + "/auth/v1/user", {
      headers: { apikey: SB_KEY, Authorization: "Bearer " + m[1] },
      signal: AbortSignal.timeout(AUTH_DEADLINE_MS),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    return typeof j?.id === "string" && j.id ? j.id : null;
  } catch {
    /* Supabase unreachable. Refusing is the only safe answer: treating an
       outage as "probably fine" turns the check off exactly when nobody is
       watching. */
    return null;
  }
}

const stripPrefix = (s: string) => s.replace(/^data:image\/\w+;base64,/, "");

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    // The page hides the feature on this, rather than showing a broken button.
    res.status(503).json({ error: "not_configured" });
    return;
  }
  /* Before the rate limit, not after: an anonymous caller should not be able
     to consume anybody's allowance, and checking identity first means the
     limit below can be keyed to a person instead of to an address. */
  const uid = await callerId(req);
  if (!uid) {
    res.status(401).json({ error: "signin_required", message: "Sign in to use this." });
    return;
  }

  /* Keyed to the account rather than to x-forwarded-for. An IP is not an
     identity - it is shared by everyone behind one NAT and changed by anyone
     with a VPN, so it punished the wrong people and stopped the wrong ones.
     An account id is stable, and making a second account is now the cost of
     doubling your allowance. */
  if (overLimit(uid)) {
    res.status(429).json({ error: "rate_limited", message: "Too many requests - wait a minute." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const mode: "identify" | "locate" = body?.mode === "locate" ? "locate" : "identify";
    const image = stripPrefix(String(body?.image ?? ""));
    if (!image) {
      res.status(400).json({ error: "bad_request", message: "No image supplied." });
      return;
    }
    if (Buffer.byteLength(image, "base64") > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: "too_large", message: "Image is over 4 MB." });
      return;
    }

    const client = new Anthropic({ timeout: MODEL_DEADLINE_MS, maxRetries: 0 });
    const { Identified, Located } = shapes(layersFrom(body?.layers));
    const format = zodOutputFormat(mode === "locate" ? Located : Identified);
    const img = { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: image } };

    const prompt = mode === "locate"
      ? `This is a pixel-art character wearing or carrying one added item - a hat, necklace, backpack, glasses, or similar.

Identify the single added item and give a tight box around ONLY that item, in fractions of the image size.

The box must not include the character's head, torso or arms except where the item overlaps them. If the item is hard to separate from the body, set reliable to false rather than guessing a loose box.`
      : `This is a single pixel-art trait on a transparent background, cut out from a character.

Name it and choose the layer it belongs on.`;

    /* create, and parsed here, rather than parse: parse throws on an answer
       cut off mid-JSON before stop_reason can be read, and that throw landed
       in the catch below as "Could not reach Claude". */
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system:
        "You label pixel-art traits for an NFT collection. Names are short and kebab-case. " +
        "Be literal about what is drawn; do not invent detail you cannot see.",
      messages: [{ role: "user", content: [img, { type: "text", text: prompt }] }],
      output_config: { format },
    });

    if (response.stop_reason === "refusal") {
      res.status(422).json({ error: "refused", message: "Claude declined to describe this image." });
      return;
    }
    if (response.stop_reason === "max_tokens") {
      res.status(502).json({ error: "cut_off", message: "Claude's answer was cut off before it finished - try again." });
      return;
    }
    const text = response.content.find((b: any) => b.type === "text") as any;
    let parsed: any = null;
    try { parsed = text ? format.parse(text.text) : null; } catch { parsed = null; }
    if (!parsed) {
      res.status(502).json({ error: "unparsed", message: "No structured answer came back." });
      return;
    }
    res.status(200).json({
      ...parsed,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    // Logged, never returned: an upstream 400 describes THIS request's shape,
    // which is what a caller-side bug looks like, but it is not the client's
    // to see. Read it in the Vercel function logs.
    console.error("anthropic_error", status, JSON.stringify({
      type: err?.error?.error?.type ?? err?.name,
      message: err?.error?.error?.message ?? err?.message,
    }));
    // Never echo the upstream error verbatim - it can carry request details.
    /* A 400 covers both "the request was malformed" and "there is no credit on
       the account", which are completely different problems for whoever runs
       this. Collapsing them cost real debugging time, so credit is called out
       by name. The upstream text is matched, not echoed. */
    /* The model deadline above, said as what it is. */
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      res.status(504).json({ error: "timeout", message: "Claude did not answer in time - try again." });
      return;
    }
    const upstream = String(err?.error?.error?.message ?? err?.message ?? "");
    if (/credit balance is too low|billing/i.test(upstream)) {
      res.status(402).json({
        error: "no_credit",
        message: "The Anthropic account backing this site is out of API credit.",
      });
      return;
    }
    const known: Record<number, string> = {
      400: "Claude rejected the request as malformed.",
      401: "The API key on the server is not valid.",
      429: "Claude is rate limiting - try again shortly.",
      529: "Claude is overloaded - try again shortly.",
    };
    res.status(status >= 400 && status < 600 ? status : 500)
      .json({ error: "upstream", message: known[status] ?? "Could not reach Claude." });
  }
}
