/**
 * Take an order.
 *
 * POST: the design, the options and the customer's details come in; the
 * server works out the price from lib/price.mjs (never from a number the
 * browser sent), writes the order to Supabase, opens a Stripe Checkout
 * session for that amount, and answers with the Checkout URL to send the
 * customer to. The webhook in stripe-webhook.ts marks the row paid.
 *
 * GET ?code=CH-XXXXXX: the order's status, for the thank-you page. No
 * personal detail comes back - a six-character code is not a password.
 *
 * Runs server-side because two keys must never reach the browser: the
 * Supabase service role key (which bypasses row level security) and the
 * Stripe secret key (which can refund and charge). Both live in environment
 * variables and only these functions see them.
 *
 * Stripe and Supabase are called over plain fetch rather than through their
 * SDKs: two requests each, with stable shapes, is not worth two dependencies
 * and their cold-start cost on a function that runs once per order.
 */
import { randomInt } from "node:crypto";
import { z } from "zod";
import { quote, PRICING } from "../lib/price.mjs";

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";

const STORE_DEADLINE_MS = 8_000;
const STRIPE_DEADLINE_MS = 15_000;

/* The whole body, as the platform receives it. Vercel refuses past 4.5 MB
   anyway; this is the number the page is built against (images are shrunk
   before they are sent), stated here so the two agree on purpose. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGES_PER_BOARD = 4;
const MAX_TEXTS_PER_BOARD = 8;

/* A brake on a public endpoint that writes rows. Per-instance and therefore
   leaky (serverless spins up many), which is enough to stop one tab
   hammering it, and honestly not more than that. */
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
function overLimit(who: string): boolean {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(who, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

/* ---- what an order looks like ------------------------------------------ */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #rrggbb");
const inches = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const dataUrl = z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "image must be a PNG, JPEG or WebP data URL")
  .refine((s) => s.length <= MAX_IMAGE_BYTES * 1.4, "image is too large");

const textEl = z.object({
  type: z.literal("text"),
  id: z.string().max(16),
  text: z.string().min(1).max(60),
  font: z.string().min(1).max(40),
  size: inches(0.5, 20),
  color: hex,
  outline: hex,
  outlineWidth: inches(0, 1),
  x: inches(-6, 30), y: inches(-6, 54),
  rotation: z.number().finite().min(-180).max(180),
});
const imageEl = z.object({
  type: z.literal("image"),
  id: z.string().max(16),
  src: dataUrl,
  width: inches(0.5, 30),
  x: inches(-6, 30), y: inches(-6, 54),
  rotation: z.number().finite().min(-180).max(180),
  opacity: z.number().finite().min(0).max(1),
});
const board = z.object({
  base: z.object({
    kind: z.enum(["paint", "wood"]),
    color: hex,
    stain: z.string().max(20),
  }),
  pattern: z.object({
    kind: z.string().max(20),
    color: hex,
    size: inches(0.5, 12),
  }),
  elements: z.array(z.discriminatedUnion("type", [textEl, imageEl])).max(MAX_TEXTS_PER_BOARD + MAX_IMAGES_PER_BOARD)
    .refine((els) => els.filter((e) => e.type === "image").length <= MAX_IMAGES_PER_BOARD, "too many images on one board")
    .refine((els) => els.filter((e) => e.type === "text").length <= MAX_TEXTS_PER_BOARD, "too many text items on one board"),
});
const design = z.object({
  version: z.literal(1),
  same: z.boolean(),
  a: board,
  b: board,
});

const US_STATE = /^(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/;
const orderIn = z.object({
  options: z.object({
    product: z.enum(["set", "single"]),
    quantity: z.number().int().min(1).max(PRICING.maxQuantity),
    finish: z.enum(["satin", "gloss"]),
    bags: z.enum(["none", "regulation"]),
    bagColors: z.tuple([hex, hex]).optional(),
    rush: z.boolean(),
  }),
  design,
  previews: z.array(dataUrl).min(1).max(2),
  customer: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional().default(""),
  }),
  shipping: z.object({
    line1: z.string().trim().min(1).max(120),
    line2: z.string().trim().max(120).optional().default(""),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().toUpperCase().regex(US_STATE, "a two-letter US state"),
    postal: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "a 5-digit ZIP"),
    country: z.literal("US"),
  }),
  notes: z.string().trim().max(2000).optional().default(""),
});
export type OrderIn = z.infer<typeof orderIn>;

/* Order codes: six characters from an alphabet with no 0/O or 1/I, because
   a customer will read this over the phone. 30^6 is 729 million; the
   column's UNIQUE constraint catches the collision that will not happen. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return "CH-" + s;
}

/* ---- Supabase, over REST ----------------------------------------------- */

const configured = () => Boolean(SB_URL && SB_SERVICE);

async function sb(path: string, init: RequestInit & { prefer?: string } = {}) {
  const headers: Record<string, string> = {
    apikey: SB_SERVICE,
    Authorization: "Bearer " + SB_SERVICE,
    "Content-Type": "application/json",
    ...(init.prefer ? { Prefer: init.prefer } : {}),
  };
  const r = await fetch(SB_URL + "/rest/v1/" + path, { ...init, headers, signal: AbortSignal.timeout(STORE_DEADLINE_MS) });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!r.ok) {
    const err: any = new Error("supabase " + r.status + " on " + path.split("?")[0] + ": " + (json?.message ?? text.slice(0, 200)));
    err.status = r.status;
    err.code = json?.code;
    throw err;
  }
  return json;
}

/* ---- Stripe, over REST ------------------------------------------------- */

/* Stripe's API takes form encoding, with nested keys written as
   line_items[0][price_data][unit_amount]. This flattens an object to that. */
export function formEncode(obj: any, prefix = "", out: string[] = []): string {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + "[" + k + "]" : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}

async function stripeCheckout(code: string, q: ReturnType<typeof quote>, customer: OrderIn["customer"], siteUrl: string) {
  const body = {
    mode: "payment",
    client_reference_id: code,
    customer_email: customer.email,
    success_url: siteUrl + "/?order=success&code=" + code,
    cancel_url: siteUrl + "/?order=cancelled&code=" + code,
    metadata: { order_code: code },
    payment_intent_data: { metadata: { order_code: code }, description: "Custom cornhole order " + code },
    line_items: Object.fromEntries(q.lines.map((l, i) => [i, {
      quantity: l.qty,
      price_data: { currency: q.currency, unit_amount: l.unit, product_data: { name: l.label } },
    }])),
  };
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: "Bearer " + STRIPE_KEY, "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode(body),
    signal: AbortSignal.timeout(STRIPE_DEADLINE_MS),
  });
  const json: any = await r.json().catch(() => null);
  if (!r.ok || !json?.url) {
    const err: any = new Error("stripe " + r.status + ": " + (json?.error?.message ?? "no session url"));
    err.status = r.status;
    throw err;
  }
  return { id: String(json.id), url: String(json.url) };
}

/* ---- the handler ------------------------------------------------------- */

const siteUrlFor = (req: any) => (process.env.SITE_URL ?? ("https://" + String(req.headers?.host ?? "localhost"))).replace(/\/+$/, "");

const CODE = /^CH-[A-Z0-9]{6}$/;

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    const code = String(req.query?.code ?? "").toUpperCase();
    if (!CODE.test(code)) { res.status(400).json({ error: "bad_request", message: "That is not an order code." }); return; }
    if (!configured()) { res.status(503).json({ error: "not_configured" }); return; }
    try {
      const rows = await sb("cornhole_orders?select=code,status,product,quantity,amount_cents,currency,created_at&code=eq." + encodeURIComponent(code));
      if (!rows?.length) { res.status(404).json({ error: "not_found" }); return; }
      res.status(200).json(rows[0]);
    } catch (err: any) {
      console.error("order_lookup_error", err?.message);
      res.status(502).json({ error: "store", message: "Could not look the order up right now." });
    }
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  /* The page hides nothing on this; it says ordering is not switched on and
     offers the print file instead. An order that cannot be stored must be
     refused, not acknowledged - a silent "thanks" with nowhere to put it is
     the worst answer there is. */
  if (!configured()) { res.status(503).json({ error: "not_configured", message: "Ordering is not switched on yet." }); return; }

  const who = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || "unknown";
  if (overLimit(who)) { res.status(429).json({ error: "rate_limited", message: "Too many orders from here - wait a minute." }); return; }

  let raw: any;
  try { raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { res.status(400).json({ error: "bad_request", message: "The order was not valid JSON." }); return; }
  if (Buffer.byteLength(JSON.stringify(raw ?? ""), "utf8") > MAX_BODY_BYTES) {
    res.status(413).json({ error: "too_large", message: "The design is too large to send - shrink the images." }); return;
  }
  const parsed = orderIn.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: "bad_request", message: (first?.path.join(".") || "order") + ": " + (first?.message ?? "invalid") });
    return;
  }
  const order = parsed.data;
  if (order.options.bags === "regulation" && !order.options.bagColors) {
    res.status(400).json({ error: "bad_request", message: "options.bagColors: pick two bag colours" }); return;
  }
  if (order.options.product === "set" && !order.design.same && order.previews.length !== 2) {
    res.status(400).json({ error: "bad_request", message: "previews: two different boards need two previews" }); return;
  }

  const q = quote(order.options);
  const code = newCode();
  const row = {
    code,
    status: "pending",
    product: order.options.product,
    quantity: order.options.quantity,
    options: { ...order.options, lines: q.lines },
    design: order.design,
    previews: order.previews,
    customer: order.customer,
    shipping: order.shipping,
    notes: order.notes || null,
    amount_cents: q.total,
    currency: q.currency,
  };

  let inserted: any;
  try {
    inserted = (await sb("cornhole_orders", { method: "POST", body: JSON.stringify(row), prefer: "return=representation" }))?.[0];
  } catch (err: any) {
    console.error("order_store_error", err?.status, err?.code, err?.message);
    res.status(502).json({ error: "store", message: "Could not save the order - nothing was charged. Try again in a minute." });
    return;
  }

  /* No Stripe key: the order is kept and the customer gets a code, and the
     shop invoices by hand. Said in the answer so the page can say it too. */
  if (!STRIPE_KEY) {
    res.status(200).json({ code, id: inserted?.id ?? null, url: null, total: q.total, payment: "invoice" });
    return;
  }

  try {
    const session = await stripeCheckout(code, q, order.customer, siteUrlFor(req));
    await sb("cornhole_orders?code=eq." + code, { method: "PATCH", body: JSON.stringify({ stripe_session_id: session.id }) });
    res.status(200).json({ code, id: inserted?.id ?? null, url: session.url, total: q.total, payment: "stripe" });
  } catch (err: any) {
    /* The row stays, as pending with no session: a person can still invoice
       it by the code, and the customer is told exactly that. */
    console.error("order_checkout_error", err?.status, err?.message);
    res.status(502).json({
      error: "checkout", code,
      message: "The order " + code + " was saved but the card page could not be opened. Nothing was charged - we will email you a payment link.",
    });
  }
}
