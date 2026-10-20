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
- LIVE - Standalone Atlas Instant Quote (one-time purchase, quote page only): customer signs up at https://atlasapp-two.vercel.app/?signup=quote, enters business name + mobile number, edits the example prices, presses Copy website code, pastes it into their site. Edits later happen in the same screen and the site updates itself. Requests arrive as a text plus a Requests list. The full CRM stays an optional upgrade.
- LIVE - Messenger + Instagram auto-reply that sends people to the instant quote page (set up in Meta Business Suite).

## Never miss a lead
- LIVE - Phone notification (banner, sound, red badge on the Atlas icon) the moment a request comes in.
- LIVE - Text-message alert to the owner with the full details so they can reply fast: vehicle, size, condition, timing, each service and add-on, full estimate range plus a middle number, phone, email, address, notes.
- LIVE - Every request lands in Leads and creates a follow-up for today automatically.
- LIVE - Duplicate-tap protection: same customer sending twice is one lead.
- BUILT - Optional "we got your request" text to the customer (with their consent).
- PLANNED - Email alert (needs email service key, see To-Do).

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
- Email alerts and customer emails via Resend (needs Andre's Resend account + API key).
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
- Decide the one-time price for Atlas Instant Quote.
- Texts to each customer-owner go out through Atlas's Quo number: watch the cost as customers are added.
- Test the quote-only sign-up once with a real email on the live site (local test passed).
