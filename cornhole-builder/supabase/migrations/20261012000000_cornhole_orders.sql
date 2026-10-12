-- Orders, one row each, written only by the server.
--
-- Row level security is ON and there are NO policies: the anon and
-- authenticated roles can neither read nor write a row, and the privileges
-- below are revoked so the REST API refuses them before RLS is even asked.
-- api/order.ts and api/stripe-webhook.ts use the service role key, which
-- bypasses RLS, and that key only ever lives in a server environment
-- variable. An order holds a customer's name and address; nothing a browser
-- sends can read one back.
--
-- design is the whole design as the page saved it (its JSON, images as data
-- URLs included) so a board can be rebuilt exactly, and previews holds the
-- small PNGs the shop prints a job sheet from. amount_cents is what the
-- server quoted, kept with the row so a later price change cannot rewrite
-- history. status moves pending -> paid by the Stripe webhook, and from
-- there by hand (or by whatever admin page comes next).

create table if not exists public.cornhole_orders (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^CH-[A-Z0-9]{6}$'),
  status                text not null default 'pending'
                          check (status in ('pending', 'paid', 'in_production', 'shipped', 'cancelled')),
  product               text not null check (product in ('set', 'single')),
  quantity              integer not null check (quantity between 1 and 10),
  options               jsonb not null default '{}'::jsonb,
  design                jsonb not null,
  previews              jsonb not null default '[]'::jsonb,
  customer              jsonb not null,
  shipping              jsonb not null,
  notes                 text check (notes is null or length(notes) <= 2000),
  amount_cents          integer not null check (amount_cents >= 0),
  currency              text not null default 'usd',
  stripe_session_id     text unique,
  stripe_payment_intent text,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists cornhole_orders_status_created_idx
  on public.cornhole_orders (status, created_at desc);

alter table public.cornhole_orders enable row level security;

revoke all on table public.cornhole_orders from anon, authenticated;

-- updated_at follows every change, so "what moved since" is a query.
create or replace function public.cornhole_orders_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists cornhole_orders_touch on public.cornhole_orders;
create trigger cornhole_orders_touch
  before update on public.cornhole_orders
  for each row execute function public.cornhole_orders_touch();
