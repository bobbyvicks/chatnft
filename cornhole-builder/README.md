# Cornhole Board Builder

A site where people design their own cornhole boards and order them.

- **Design live.** A regulation 24" x 48" board (6" hole, 9" from the top)
  drawn on a canvas in inches, not pixels. Painted or stained-wood base,
  eleven patterns, text in eight fonts with outline and rotation, uploaded
  logos, drag to place, undo/redo, and the design is kept in the browser
  across reloads. One design for both boards, or a different one each.
- **Print file.** The same drawing code renders a 2400 x 4800 PNG at 100
  pixels per inch, with the hole marked as a hairline for the shop.
- **Order.** Options (set or single, finish, bags, rush, quantity), a live
  quote, a shipping form, and payment on Stripe Checkout. Orders land in a
  Supabase table; the Stripe webhook marks them paid.

Everything the customer sees is one static file, `index.html`, plus
`lib/price.mjs`. Two serverless functions in `api/` do the parts that need
secrets. No build step.

## Run it locally

    npm install
    npm run serve          # http://127.0.0.1:5611

The designer works fully without any configuration. Ordering needs the
functions below, which run on Vercel (`vercel dev` serves them locally).

## Deploy

Deploy the folder as a Vercel project. `index.html` is served as-is and
`api/*.ts` become functions. Set these environment variables:

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | The project URL, `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key. Server only, never in the page. |
| `STRIPE_SECRET_KEY` | `sk_live_…` or `sk_test_…`. Without it, orders are stored and answered as "we will invoice you". |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for the endpoint below. |
| `SITE_URL` | Where Stripe sends people back, e.g. `https://boards.example`. Defaults to the request's host. |

Then:

1. Run `supabase/migrations/20261012000000_cornhole_orders.sql` on the
   project (SQL editor or `supabase db push`). It creates `cornhole_orders`
   with row level security on and no policies: only the service role can
   read or write it.
2. In Stripe, add a webhook endpoint at `https://<site>/api/stripe-webhook`
   for the event `checkout.session.completed`, and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.
3. Optionally turn on Stripe Tax and add `automatic_tax[enabled]=true` to the
   session body in `api/order.ts`; the page already tells customers tax is
   added at checkout.

## How an order moves

1. The page posts the design, the options, the previews and the address to
   `POST /api/order`.
2. The function validates everything (zod), prices it from `lib/price.mjs`
   (a total sent by the browser is ignored), inserts a `pending` row with a
   code like `CH-7F3K2Q`, opens a Stripe Checkout session for the quote's
   line items, and answers with the Checkout URL.
3. Stripe takes payment and sends the customer back to
   `/?order=success&code=…`, which shows the code and fetches the status
   from `GET /api/order?code=…` (status and amount only, never the address).
4. Stripe calls `/api/stripe-webhook`; after checking the signature it
   moves the row from `pending` to `paid`. A second delivery, or one that
   arrives after the shop has moved the order on, changes nothing.

Orders with no Stripe key, and orders whose Checkout failed to open, stay
`pending` with no session id: the shop invoices those by hand from the row.

## Prices

Everything is in `lib/price.mjs`, in cents. The page and the server read the
same file, so a change there shows in the quote and is what gets charged.

## Tests

    npm test               # node tests, typecheck, then the browser suite
    npm run test:node      # pricing, the order API, the webhook: no browser
    npx playwright test    # the designer and the order flow in Chromium

The browser specs read pixels off the preview canvases and drive the page
through `window.cornhole`, the one global the page exposes on purpose. If
the environment ships its own Chromium, point `PLAYWRIGHT_CHROMIUM` at it.

## Still to do

- An admin view of orders (the table is the only one today).
- Email to the shop and the customer on a new paid order.
- Shipping outside the contiguous US, and real carrier rates.
- A shareable link for a design (images make the URL too long; it needs a
  saved-designs table).
- The brand name, copy, and prices are placeholders.
