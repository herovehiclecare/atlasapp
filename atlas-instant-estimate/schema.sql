-- Atlas Instant Estimate — schema additions.
-- NOT APPLIED. Review before running against the live project.
--
-- Everything the estimate request itself needs already exists:
-- customers.source / source_ref / lead_context and quotes.status / line_items / totals
-- are the same columns the Facebook lead webhook writes to. The only new thing is a
-- public, guessable-but-not-secret handle for the business's estimate page, plus a
-- switch so a business can turn the page off without deleting it.

alter table public.businesses
  add column if not exists estimate_slug text unique,
  add column if not exists estimate_enabled boolean not null default false,
  add column if not exists estimate_reply_window text default 'within 1 business hour',
  -- show_range: the customer sees the full low–high band
  -- show_from:  the customer sees "from $X" only
  -- hide:       no price shown, the request is still captured
  add column if not exists estimate_price_display text not null default 'show_range';

alter table public.businesses
  add constraint businesses_estimate_price_display_check
  check (estimate_price_display in ('show_range','show_from','hide'));

-- Slug format: lowercase letters, numbers and single hyphens, 3-40 chars.
alter table public.businesses
  add constraint businesses_estimate_slug_format
  check (estimate_slug is null or estimate_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create index if not exists businesses_estimate_slug_idx
  on public.businesses (estimate_slug) where estimate_enabled;

-- The public page reads the catalog through the service-role edge function, so no
-- anon SELECT policy is added here on purpose: nothing about a business's pricing
-- becomes readable with the publishable key just because this page exists.

-- Seed for the first tenant:
-- update public.businesses
--   set estimate_slug = 'detail-hero', estimate_enabled = true
--   where id = 'ac96b595-8468-42a6-8336-0fb0e7c07d2d';
