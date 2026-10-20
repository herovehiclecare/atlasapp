# Atlas Feature List + To-Do (for selling and building)

Living list. Master copy lives in the project folder (ATLAS_FEATURES.md); a copy is kept on the Desktop in "Atlas Plan" as 04-Features-and-To-Do.md. Update both whenever something ships or a new to-do comes up.
Status: LIVE, BUILT (not yet switched on), PLANNED.

## Get more customers
- LIVE - Instant Quote page: customer picks vehicle + service, sees a price range in about 30 seconds, sends the request. Embeds on the shop's own website.
- LIVE - Shop sets its own prices, add-ons, vehicle sizes, condition and timing (customers can't change prices).
- LIVE - Fixed-price services: a service with no range shows one exact price (no range, no "+"). Services with a range show the range.
- LIVE - Customer's year / make / model captured on every request.
- LIVE - "Something Else" tile (Motorcycle, Boat, RV) at the top of the quote page: tap it, pick Motorcycle / Boat / RV / Something Else, then describe the job. It arrives as a lead with no price, with the same phone alert and text.
- LIVE - Price groups (like Mobile Maintenance) start closed on the quote page; the customer taps to open.
- LIVE - Current Specials on the quote page (off by default; the public accordion and the editor list both start closed): owner turns on "Show specials on my quote page" in Settings > Instant Quote, adds specials (name, description, price as a range or one flat price, optional end date). They show first under a "Current Specials" bar (title editable), same look as the other services with a "Special - ends <date>" tag, and disappear by themselves after the end date. Flat price (same low and high) is exact on the page and on the lead.
- LIVE - Standalone Atlas Instant Quote (one-time purchase, quote page only): customer signs up at https://atlasapp-two.vercel.app/?signup=quote, enters business name (phone optional, shown on their page), edits the example prices, presses Copy website code, pastes it into their site. Edits later happen in the same screen and the site updates itself. Requests arrive as a phone notification (free) plus a Requests list; customers do NOT use Atlas's text number. The full CRM stays an optional upgrade.
- LIVE - Messenger + Instagram auto-reply that sends people to the instant quote page (set up in Meta Business Suite).

## Never miss a lead
- LIVE - Phone notification (banner, sound, red badge on the Atlas icon) the moment a request comes in.
- LIVE - Text-message alert to the owner with the full details so they can reply fast: vehicle, size, condition, timing, each service and add-on, full estimate range plus a middle number, phone, email, address, notes.
- LIVE - Every request lands in Leads and creates a follow-up for today automatically.
- LIVE - Duplicate-tap protection: same customer sending twice is one lead.
- BUILT - Optional "we got your request" text to the customer (with their consent).
- LIVE - Texts through the Atlas number are blocked for every business except Andre's own (server rule). Other accounts get phone notifications plus the Requests list. No email alerts (decided: no Resend account).
- LIVE - Faster quote page: logo served separately and cached, config is about 4KB instead of 78KB, loading starts earlier.

## Run the shop
- LIVE - Leads board, Customers list, Follow-ups, Schedule, Vehicles.
- LIVE - Employees and business hours settings.
- LIVE - Install on the phone Home Screen like an app (own Atlas icon).
- LIVE - Team Logins with three access levels, owner picks the level when inviting and can change it any time:
  - Owner: everything (prices, invoices, revenue, settings, Team Logins).
  - Manager: leads, customers, vehicles, follow-ups, schedule, employees, business hours. No prices, invoices, revenue or Team Logins.
  - Staff: leads, customers, vehicles, follow-ups, schedule. No prices, invoices, revenue or settings.

## Sales notes
- Positioning: simple, fast, and built for detailers. Not an everything-software.

---

## To-Do: make it a fuller live CRM
Come back to these after the design look and style is settled.
- Wire the same instant alert (push + text) into the Facebook lead webhook.
- Dashboard phone-first design pass (design look and style first).
- Settings screen for the "popular" flag and service photos on the quote page.
- Test Team Logins end to end with a real second login (invite, sign up, land in shop at right level).
- Data-level lockdown: Manager/Staff are blocked in the app screens today. Later, also lock invoices/quotes at the database so a tech-savvy staffer can't read them through the API.
- "Add a vehicle type" in Settings > Instant Quote: owner adds Boat, Motorcycle, RV and so on, each with its own services and low-high prices. Each becomes its own tile on the quote page; "Something Else" stays as the catch-all. Also makes the page work for other trades and shops (proposed by Andre; build after the design look and style is settled).
- Messenger auto-reply set-up check in Meta Business Suite.
- Shopify $39 Done-For-You Setup offer.
- Delete the "John Doe TEST" lead after Andre confirms the new text format.
- Upgrade path from Instant Quote only to the full CRM (today Andre removes ui_prefs.mode in the database by hand).
- Instant Quote Shopify product is built as a DRAFT ($147 self-serve / $247 we set it up). Andre to review, then say go to publish. Two hidden (unpublished) Shopify pages, both in the green Atlas hex look: atlas-instant-quote (sales/feature page with real demo screens: quote page, specials, send, phone alert, Requests, editor) and atlas-instant-quote-setup (7 steps + where the code goes). Demo images live in public/promo (atlas-quote-1..4.png, atlas-alert.jpg, atlas-requests.jpg, atlas-editor.jpg, atlas-hex.svg, atlas-website-and-phone.png). The sales page opens with a "Lives on your website. Alerts on your phone." section (browser mock of the form embedded on a business site next to the phone alert) so buyers see it goes on their own website. Next come "Fewer price-shoppers. More ready-to-book customers." (tire-kicker pain point, written as a pattern with NO invented stats or research claims) and "A tool that works with your website" (what the tool does vs what the owner still does: it is a quote tool, not booking/payments/auto-texting). FAQ has a "Does it book jobs or take payments?" answer. Selling guide: Desktop Atlas Plan 06-Atlas-Instant-Quote-How-To-Sell.md.
- COME BACK TO: the customer walk-through (sit down with Andre and rehearse the 7 steps and the done-for-you process).
- Sign-up link is open to anyone (free, no payment gate). Keep it off public pages; send it only after purchase. If it leaks, add an access code.
- Atlas design direction (Andre likes it): dark forest #06100C, green #18D97A, ONE hex plate print with the Atlas peak mark in a few plates (single layer, no overlapping patterns), Fjalla One headings on Shopify pages, generic 'Your Business Name', never Detail Hero branding.
- Andre does one real quote-only sign-up on the live site with a different email (local test passed; the browser tool cannot create real accounts).
