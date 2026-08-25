# Atlas

A React + Vite app for a detailing business: dashboard, vehicles, customers, schedule,
invoices, settings, and Atlas QuickQuote Pro (with tiered proposals, saved quotes,
PDF/CSV export, and more).

## Run it locally

**Requirements:** [Node.js](https://nodejs.org) 20.19+ or 22.12+ (check with `node --version`).

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`). Sign in with any
email/password that passes basic validation — the login is currently a timed mock,
not real auth (more on that below).

To build for production / deploy anywhere that serves static files (Vercel, Netlify,
Cloudflare Pages, etc.):

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

## What's real right now, what's mock

Everything you see works and is genuinely interactive — but all the data lives in
React state, seeded from constants in each file. That means:

- **Nothing persists.** Refresh the page and every saved quote, every setting, every
  "sent" invoice resets to the seed data.
- **Nothing is shared across pages.** The customer list in Customers and the customer
  list in Quick Quote are two separate hardcoded arrays — they happen to overlap, but
  editing one doesn't touch the other.
- **Login is fake.** It validates the email format and password length, waits ~1
  second, then lets you in. It doesn't check credentials against anything real.
- **Nothing is sent.** "Email," "text," PDF, calendar, and contact actions either
  generate a real downloadable file (PDF/CSV/ICS/VCF do actually work — those are
  genuine browser downloads) or just flip a "sent" flag with no real delivery.

None of that is a bug — it's exactly what you'd expect from a UI built before there's
a backend. The next real step is wiring one up.

## Adding Supabase (the missing backend)

[Supabase](https://supabase.com) is a hosted Postgres database plus auth, file storage,
and realtime subscriptions, with a generous free tier (500MB DB, 50k monthly active
users for auth, no credit card required to start). It's the natural fit here because:

1. It replaces the fake login with real accounts (`supabase.auth`) in a few lines.
2. It gives Customers, Vehicles, Schedule, Invoices, and Quick Quote one shared
   Postgres database instead of six separate mock arrays — add a customer once,
   it shows up everywhere.
3. It has row-level security, so if you ever have more than one employee logging in,
   you can control who sees what without writing your own auth layer.

**Rough shape of the work**, once you're ready for it:

1. Create a free project at [supabase.com](https://supabase.com).
2. `npm install @supabase/supabase-js`, create a `src/supabaseClient.js` with your
   project URL and anon key (stored in a `.env` file, never committed).
3. Create tables for `customers`, `vehicles`, `quotes`, `invoices`, `jobs` — mirroring
   the shapes already used in the mock data, so the swap is mostly "replace `useState`
   with a `useEffect` that fetches from Supabase."
4. Swap `AtlasLoginFinal.tsx`'s fake `setTimeout` for `supabase.auth.signInWithPassword`.
5. One page at a time, replace the hardcoded arrays with real queries.

This is a real, multi-step project — not a five-minute change — but each step is
independent, so you can do it incrementally without breaking what already works.

## Using Claude Code for this next phase

Claude Code is a separate tool from this chat — it's a coding agent that runs in
your own terminal (or desktop/VS Code) directly against your actual project folder,
with real internet access, so it can `npm install` packages, talk to a real Supabase
project, run your dev server, and see actual errors when something breaks. I can't
launch or drive it myself from here; it's installed and run on your machine.

To get it: `curl -fsSL https://claude.ai/install.sh | bash` (macOS/Linux/WSL), or
`irm https://claude.ai/install.ps1 | iex` in PowerShell on Windows. Then `cd` into
this project folder and run `claude` — it logs in with your Claude account (Pro,
Max, Team, or Enterprise) and starts an interactive session where you can say things
like "wire up Supabase auth for the login screen" or "add a customers table and
replace the mock array in AtlasCustomersFinal with a real query," and it edits the
files directly, asking before it changes anything.

Everything in this repo is regular React — Claude Code (or any other tool, or you by
hand) can pick it up with no special setup beyond what's in this README.
