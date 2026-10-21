# Atlas Instant Quote: troubleshooting guide (internal)

Written 2026-10-21 from the real code. Pair it with `ATLAS_BUYER_LOOKUP.md` (how to look a buyer up in Supabase).

## What already fixes itself today

| Problem | What Atlas does on its own |
|---|---|
| Customer double-taps Send, or fixes a typo and resends | Same phone (or email) within 10 minutes counts as one lead. No duplicates. |
| Someone tries to edit the price | They can't. The page sends choices only. The server works out every price from the buyer's saved setup. |
| A bot floods a buyer's form | Over 20 requests a minute is blocked. Customer sees "Please call us instead." |
| A phone stops accepting alerts (app removed, new phone) | The dead phone is removed automatically the next time an alert fails. |
| Alert fails to send | The request is still saved. The alert is a separate step. |
| Something in the request list is stale or missing (old service name, deleted add-on) | It's skipped. The rest of the request still goes through. |
| Customer picks nothing, or no name, or no phone/email | Page tells them what to add. Nothing half-saved. |
| Buyer changes a price | Customers see it within about 30 seconds. No re-paste of the website code. |
| Server error on a customer's request | Customer sees "Something went wrong. Please call us instead." |
| Quote page asked for but slug missing, turned off, or no services | Shows "not found" instead of a broken form. |
| Owner phone number | Never sent to the public page. |

## Common buyer problems: what to check and fix

| What the buyer says | Likely cause | Fix |
|---|---|---|
| Quote page blank or "not found" | Quote page turned off, no web address saved, or no services saved | In Supabase > businesses: check `estimate_slug` is filled and `estimate_enabled` is true. Have them press Save in Settings. |
| Website form is blank but the link works | Code pasted into a block that strips code, or page not published | Use their builder's HTML/Embed block (see setup page). Publish the page. Test on a phone and a laptop. |
| Prices did not change | They didn't press Save, or they have the page cached | Check `estimate_config` in Supabase. If right, wait 30 seconds and refresh. |
| No phone alerts | They never turned them on, or on iPhone the app isn't on the Home Screen | Add to Home Screen first, open from the icon, tap Turn on phone notifications, Allow. A new request then buzzes. |
| Alerts worked, then stopped | Phone was replaced or app removed, so the old phone was cleaned out | Turn notifications on again on the new phone. |
| Request came in with no price | They chose "Something else" or a service with no price | Expected. The request says "needs a price." |
| Customer says the form says "call us" | Server error or too many requests in a minute | Look at Supabase > Logs > Edge Functions > `estimate-request`. Check for a bad `estimate_config`. |
| Forgot password | | Supabase > Authentication > Users > send password recovery. |
| Wants to delete their account | | Ask them to confirm by email first. Then delete in Supabase. |

## Gaps: things that do NOT fix themselves yet

1. **Supabase free plan pauses after 1 week with no activity.** If that happens, every buyer's quote page goes down at once. This is the biggest risk. Upgrading to Pro ($25/mo) ends it. Waiting on Andre's yes.
2. **Vercel Hobby plan is for non-commercial use only.** Move to Pro ($20/mo) before selling at scale. Waiting on Andre's yes.
3. **Nobody is alerted when a quote page breaks.** Errors only appear in logs. Right now we'd find out when a buyer complains.
4. **Buyers get phone alerts only.** If a buyer never turns them on, they miss requests. Email alerts need a Resend account (Andre will set up later).
5. **No "test my page" button for buyers.** They find out it's broken when a customer tells them.

## Proposed automatic fixes (in order)

1. **Upgrade Supabase to Pro** (and confirm Vercel Pro). Removes gap 1 and 2. Needs Andre's yes. Billing change.
2. **Daily health check:** a scheduled job opens Detail Hero's quote page and the request function. If either fails, it sends a push alert to Andre's phone.
3. **Failed-request alert:** when a customer's request fails with a server error, save it and push an alert to Andre (not the buyer). No lost leads go unnoticed.
4. **"Test my quote page" button** in buyer Settings. Checks the page loads, prices are filled in, and phone alerts are on. Tells them in plain words what to fix.
5. **Welcome nudge:** if a buyer finishes signup but never turns on notifications, show a banner until they do.

## Rule of thumb
Fix the cause for the one buyer first. If the same question comes up twice, add it to this sheet. If it comes up three times, build the automatic fix.

## Decision: stay on the free plans for now (Andre, 2026-10-21)
No upgrade yet. Revisit when we start actively selling Instant Quote.

**Upgrade to Supabase Pro ($25/mo) and Vercel Pro ($20/mo) when any of these happen:**
- The first real buyer pays (they are relying on the page being up).
- A quote page ever goes down because the project paused.
- The database nears 500 MB (it is 14 MB now) or function calls near 500,000 a month.
- Vercel asks for a commercial plan (Hobby is non-commercial only).

**What "paused" means:** on the free plan, Supabase switches a project off after about 1 week with no activity. While off, every quote page and the Atlas app stop working until someone clicks Restore in the Supabase dashboard. Data is kept. It is not deleted.

**Free workaround until we upgrade:** keep the project active. Detail Hero's live quote form on detailhero.net/get-a-quote probably does this by itself when people visit it, but that is not guaranteed in a slow week. Options, easiest first:
1. CHOSEN (Andre, 2026-10-21): two repeating weekly phone reminders (for example Monday and Thursday) to open Atlas and the Detail Hero quote page (30 seconds). Set on the iPhone Reminders app, because Atlas follow-ups do not repeat.
2. NOT doing: an automatic daily ping (Andre said no). Revisit only if a reminder is ever missed.

**If it ever pauses:** Supabase dashboard > project `fqggnekepfzxrkuazpiy` > Restore project. Wait a few minutes, then check the quote page loads.
