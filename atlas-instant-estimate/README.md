# Atlas Instant Estimate

A public, customer-facing estimate page for a trade business. The customer tells it
what they have and what they want, sees an honest price range immediately, and sends
the request to the business. The request lands in that business's Atlas account as a
lead with full context.

It is the mirror image of Quick Quote Pro:

| | Who drives it | Who it's for |
|---|---|---|
| Quick Quote Pro | The business quotes the customer | One operator, sold as a $97 download |
| Atlas Instant Estimate | The customer estimates themselves, then asks | Atlas subscribers, lives beside the CRM |

## Why this belongs to Atlas, not Hero Vehicle Care

Four people have now asked for this (Jeffrey plus three others). It only works if
something receives the request — a CRM, a lead inbox, follow-ups, notifications.
Atlas already has all of that and QQP has none of it (QQP is a static file the buyer
hosts themselves, with no server and no database). Putting this on the Atlas side also
gives Atlas its first genuine reason to be a subscription: the business is paying for
the thing that catches leads while they're under a car, not for a calculator.

It also makes QQP a feeder product rather than a competitor — "you already quote with
QQP, now let your website quote for you."

## Name

Recommendation: **Atlas Instant Estimate**. It says what it does to a buyer who has
never heard of it, and "Estimate" keeps it legally distinct from a binding quote.

Alternatives considered:
- **Atlas Front Desk** — best story (it greets visitors and takes the job), weakest clarity.
- **Atlas Quote Request** — accurate, a little flat.
- **Atlas Self-Quote** — clear but makes the customer sound like the one in charge of pricing.
- **Atlas Price Check** — sounds like a comparison tool, not a lead form.

Avoid "Atlas Quick Quote" — too close to Quick Quote Pro, and the whole point is that
these are opposite directions.

## How the customer uses it

1. Lands on it from the business's website ("Get your free estimate") or a texted link.
2. Fills in vehicle: year, make, model, size class.
3. Picks condition (Light / Moderate / Heavy) and how often it gets detailed.
4. Picks one or more services, plus add-ons. Can add more vehicles.
5. Sees a live running range at the bottom of the screen the whole time.
6. Enters name, phone/email, optional address and notes.
7. Sends. Gets a confirmation screen with the breakdown and the business's phone number.

## How the price range is worked out

This is the part that makes it honest instead of a gimmick. Every Atlas service already
stores four numbers: `price_car_low`, `price_car_high`, `price_suv_low`, `price_suv_high`.
That band is the business's own spread between an easy job and a rough one.

- **Size class** picks which pair of numbers to use.
- **Condition** picks where inside that band the customer lands:
  Light `0–25%`, Moderate `25–65%`, Heavy `65–100%`.
- **How often it's cleaned** raises only the top of the range (twice a year `+5%`,
  once a year or less `+10%`). It never lowers the floor, so the business can't be
  held to a number below what they set.
- A service with no `*_high` is treated as a starting price. It shows "from $X" and
  condition can only add to it.
- Multiple vehicles and services sum their ranges.

The result: a customer with a clean car sees the bottom of the band, a customer whose
truck hasn't been touched in a year sees the top. Same catalog, different honest answer.

## Where the request goes

No new tables are needed. It reuses exactly what the Facebook lead webhook already does:

- A row in `customers` with `source = 'estimate_request'`, `source_ref` = the request id,
  and `lead_context` holding the vehicles, condition, frequency, chosen services and the
  range the customer was shown.
- A row in `quotes` with `status = 'requested'`, `line_items` for the chosen services,
  and `totals = { low, high }`.

The business then opens it in Atlas, adjusts anything, and sends a real quote through
the existing Quick Quote flow. The estimate becomes the first draft of the quote.

## What still has to be built

1. **`estimate_slug` + `estimate_enabled` on `businesses`** so the URL can be
   `/estimate/detail-hero` instead of a raw UUID. See `schema.sql` — not applied yet.
2. **`api/estimate-portal.js`** — serves the page, same pattern as `api/quote-portal.js`
   (Vercel serves the HTML because Supabase Edge Functions force `text/plain`).
3. **`supabase/functions/estimate-request/index.ts`** — the POST endpoint, service-role,
   writes the customer + quote rows. Needs rate limiting; it is a public write.
4. **A "Requests" view in Atlas** — or just a filter on Customers for
   `source = 'estimate_request'`, which is the cheaper first version.
5. **Notification** — reuse the existing lead toast and whatever Settings already does
   for Facebook leads.
6. **Embed snippet** — a one-line `<iframe>` or a button the business pastes on their
   own site, since most of them are on Wix/Squarespace/GoDaddy.

## Open questions for Andre

- Should the customer see the range at all, or only the business? Showing it is the whole
  pitch, but some businesses will not want their spread public. Suggest a per-business
  toggle: show range / show "from" price only / collect the request with no price.
- Do we cap it to detailing first, or ship the 13 trades at once? Recommend detailing
  only until one real business runs it for a month.
- Photo upload at request time — very useful for condition, but adds storage and abuse
  surface. Suggest v2.
- Does this stay free with Atlas, or is it the paid tier?

## Three ways a business uses it

**1. Embedded in their own website.** `embed-snippet.html` is a copy-paste block
that drops the tool into any page — Bluehost, WordPress, Wix, Squarespace,
GoDaddy, Shopify. They change one line (their link) and paste it into an HTML /
Custom Code / Embed block.

The box resizes itself as the customer opens and closes sections, so there's never
an inner scrollbar or a tall empty gap. That works through a `postMessage` from the
quote page to the parent page; the snippet listens and sets the iframe height.
Inside an iframe the page also drops its sticky bottom bar and lets it sit at the
end of the content, since a fixed bar in a frame with no scrollbar of its own would
hang in the middle of someone's layout.

**2. Texted straight to one customer.** The page is just a URL, so it can be sent
in a text or email as-is. Known details can be filled in from the link:

```
https://.../estimate/detail-hero?name=John%20Doe&phone=4075550123
```

Anything not in the link is simply left blank, so a bare link still works. The
customer fills in the rest, sees the range, and sends it back — it lands in the
business's Atlas inbox the same way as a website submission.

**3. Linked from a button.** "Get your free estimate" anywhere — a link in bio,
a Google Business profile, a QR code on a truck.

## Branding

The business sets their own name, logo, the small line above the name, phone,
reply time and accent colour. One colour pick drives the whole palette: the
secondary tone is derived by lightening it, and the hex print and the glow behind
the header are painted *through* that colour (the pattern is a CSS mask over the
accent, not a green image), so changing the accent re-skins the whole page instead
of leaving a green background behind a blue button.

Logos are cropped square and scaled to 256px before being stored, so a 4MB phone
photo doesn't blow past what the browser will hold.

**"Powered by Atlas" is not editable.** It stays in the footer on every page.
In the demo the gear opens the branding sheet; in the real product these values
come from the business's Atlas account (`businesses.name` / `logo_url` / `phone`),
and the gear doesn't exist for the customer.

## Demo

`demo.html` is a complete working prototype — open it on a phone. It is seeded with
Detail Hero's real service catalog and real prices, so the numbers it shows are the
ones a live business would show. Everything works except the final send, which logs
the payload to the console instead of posting it.
