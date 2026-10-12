/**
 * Stripe tells us a Checkout session was paid; the order row becomes paid.
 *
 * The body is read RAW, not parsed: Stripe signs the exact bytes it sent,
 * and a body that has been through JSON.parse and back is not those bytes.
 * `config.api.bodyParser = false` is what keeps the platform's hands off it.
 *
 * The signature is checked here with node:crypto rather than with Stripe's
 * SDK: it is one HMAC over "<timestamp>.<body>", compared in constant time,
 * with the timestamp held to five minutes so a captured request cannot be
 * replayed next week. An unsigned or mis-signed request is refused with
 * 400, and Stripe retries a non-2xx, so a real event is never lost to a
 * transient failure here - it comes back.
 *
 * Only checkout.session.completed is acted on. Everything else is answered
 * 200 so Stripe stops sending it; this endpoint has nothing to do with it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const config = { api: { bodyParser: false } };

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const TOLERANCE_S = 300;

export function verifyStripeSignature(rawBody: string, header: string, secret: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  const parts = Object.create(null);
  for (const kv of String(header ?? "").split(",")) {
    const i = kv.indexOf("=");
    if (i < 0) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    (parts[k] ??= []).push(v);
  }
  const t = Number(parts.t?.[0]);
  if (!Number.isFinite(t) || Math.abs(nowS - t) > TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(parts.t[0] + "." + rawBody, "utf8").digest("hex");
  const eb = Buffer.from(expected, "utf8");
  for (const sig of parts.v1 ?? []) {
    const sb = Buffer.from(String(sig), "utf8");
    if (sb.length === eb.length && timingSafeEqual(sb, eb)) return true;
  }
  return false;
}

async function readRaw(req: any): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

export async function markPaid(session: any): Promise<"paid" | "unknown" | "no_code"> {
  const code = String(session?.client_reference_id ?? session?.metadata?.order_code ?? "").toUpperCase();
  if (!/^CH-[A-Z0-9]{6}$/.test(code)) return "no_code";
  const headers = {
    apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE,
    "Content-Type": "application/json", Prefer: "return=representation",
  };
  const patch = {
    status: "paid",
    paid_at: new Date().toISOString(),
    stripe_session_id: String(session.id ?? ""),
    stripe_payment_intent: session.payment_intent ? String(session.payment_intent) : null,
  };
  /* Only a pending row moves to paid: a second delivery of the same event,
     or one that arrives after the shop has already moved the order on, must
     not drag it back. */
  const r = await fetch(SB_URL + "/rest/v1/cornhole_orders?code=eq." + code + "&status=eq.pending", {
    method: "PATCH", headers, body: JSON.stringify(patch), signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) throw new Error("supabase " + r.status + " marking " + code + " paid");
  const rows: any = await r.json().catch(() => []);
  return rows?.length ? "paid" : "unknown";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!SECRET || !SB_URL || !SB_SERVICE) { res.status(503).json({ error: "not_configured" }); return; }

  const raw = await readRaw(req);
  if (!verifyStripeSignature(raw, req.headers?.["stripe-signature"], SECRET)) {
    res.status(400).json({ error: "bad_signature" });
    return;
  }
  let event: any;
  try { event = JSON.parse(raw); } catch { res.status(400).json({ error: "bad_json" }); return; }

  if (event?.type !== "checkout.session.completed") { res.status(200).json({ received: true, ignored: event?.type ?? null }); return; }
  const session = event.data?.object;
  if (session?.payment_status && session.payment_status !== "paid") {
    /* Delayed payment methods complete the session before the money lands;
       async_payment_succeeded would be the event for those. Cards are the
       only method this shop turns on, so this is logged, not handled. */
    console.warn("checkout_completed_unpaid", session?.id, session?.payment_status);
    res.status(200).json({ received: true, deferred: true });
    return;
  }
  try {
    const outcome = await markPaid(session);
    if (outcome !== "paid") console.warn("webhook_no_pending_row", outcome, session?.id, session?.client_reference_id);
    res.status(200).json({ received: true, outcome });
  } catch (err: any) {
    console.error("webhook_store_error", err?.message);
    res.status(502).json({ error: "store" }); // Stripe retries on this.
  }
}
