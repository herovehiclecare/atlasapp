# How to look up an Atlas buyer (admin cheat sheet)

Written 2026-10-21. Atlas has no admin screen yet. Until it does, use Supabase. Only you can see this. Buyers can only see their own account.

## Open it
1. Go to https://supabase.com/dashboard/project/fqggnekepfzxrkuazpiy
2. Log in with the account that owns the "Hero Vehicle Care" organization.

## Find a buyer by email
Left menu: **Authentication > Users**. Search the email they used to sign up. Copy the **User UID**.

## See their business
Left menu: **Table Editor > businesses**. Each row is one buyer's business. Useful columns:
- `name` and `phone`: what they typed at signup.
- `estimate_slug`: their quote page is `https://atlasapp-two.vercel.app/e/<slug>`.
- `estimate_enabled`: true means their quote page is on.
- `estimate_config`: all their prices, add-ons, specials and look. Click the cell to read it.

To match a buyer to a business: **business_members** has `user_id` (the User UID) and `business_id`.

## See their data (each table has `business_id`)
- **services**: their service list and prices.
- **customers**: their requests and customers. The `source` column shows where it came from, `lead_stage` shows where it is.
- **follow_ups**: their reminders.

Tip: in any table, use Filter > `business_id` equals the id from the businesses table.

## Copy-and-run searches (SQL Editor, these only read)
Find a business by name:
```sql
select id, name, phone, estimate_slug, estimate_enabled, created_at
from businesses where name ilike '%part of name%';
```
Their newest requests (paste the business id):
```sql
select name, phone, email, source, lead_stage, created_at
from customers where business_id = 'PASTE-ID' order by created_at desc limit 20;
```
Their services:
```sql
select category, name, price_car_low, price_car_high, price_suv_low, price_suv_high
from services where business_id = 'PASTE-ID' order by sort_order;
```

## Common problems
- **"My quote page is blank or says not found":** check `estimate_slug` is filled in and `estimate_enabled` is true.
- **"My prices did not update":** open `estimate_config` and look at the price they say is wrong. If it's wrong there, they didn't press Save. If it's right there, have them refresh the page.
- **"I am not getting alerts":** alerts go to the phone that turned them on. On iPhone the app must be added to the Home Screen first. Have them open the app from the icon and tap Turn on phone notifications.
- **"Forgot my password":** Authentication > Users > the three dots on their row > send password recovery.

## Rules for yourself
- Look freely. Change or delete only when you are sure, and tell the buyer what you changed.
- Never share one buyer's information with another buyer.
- Do not paste a buyer's data into ads, emails or social posts.

## How buyers are kept apart
Every table is locked by business in the database itself. A logged-in buyer can only read and change rows that belong to their own business. Checked 2026-10-21: a stranger login with no business sees 0 rows in every table. You can see everything here because you own the project.

## Later (when there are real buyers)
Build a small admin page inside Atlas that shows the list of buyers, their signup date, whether their quote page is on, and their last request. Build it around the questions buyers actually ask.
