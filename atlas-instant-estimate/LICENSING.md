# Atlas Instant Quote — licensing, protection and pricing

Written for Andre, 2026-10-17. Read the first section before deciding anything else.

---

## 1. The uncomfortable truth about protecting the code

**Anything that runs in a customer's browser can be copied.** Not "might be" — can be,
by anyone, in about thirty seconds, with no special tools. Right-click, View Source,
save. That is how the web works, and it is true of this tool, of Quick Quote Pro, and
of every website you have ever visited.

Minifying or scrambling the code (people call it obfuscation) makes it ugly to read.
It does not stop copying, and anyone capable of stealing a product is capable of
un-scrambling it. Treat it as a speed bump, not a lock.

So there are exactly two real protections, and only one of them is technical:

**Legal protection.** Copyright exists automatically the moment the code is written —
you own it without registering anything. A written licence agreement is what turns
"they copied it" into something you can actually act on. This is the same protection
Quick Quote Pro already relies on.

**Architectural protection.** Whatever lives on *your* server cannot be copied, because
they never receive it. This is the only protection that actually prevents theft rather
than punishing it afterwards.

That single fact decides your business model.

> I am not a lawyer. Everything in the legal sections below is how these arrangements
> normally work, not legal advice. Before you sell this, have a real attorney look at
> the licence — it is a few hundred dollars and it is the cheapest insurance here.

---

## 2. Three ways to sell it

### Option A — Hosted by you (subscription)

You run the tool. Each business gets `yoursite.com/quote/their-name`, and they paste a
one-line embed into their site. Their prices and settings live in the Atlas database.

- **They never receive the code.** Nothing to steal. This is the real protection.
- Recurring revenue, and you can fix or improve it for everyone at once.
- The request lands in their Atlas CRM — the thing that makes this worth paying for.
- Costs you hosting and support, and you have to keep it running.

### Option B — Sold as a download (one-time, like QQP)

They get the files and host them themselves.

- **You are handing over the code.** Accept that up front.
- No server, no ongoing cost, nothing to keep running.
- **The capture does not work.** With no server, a request has nowhere to land — it
  would have to open their email app, which is a worse product and loses requests.
- Easiest to sell, hardest to defend, and it undercuts the subscription.

### Option C — Install service (one-time fee, you do the work)

You charge to set it up on their existing site. Usually sits on top of A.

- Highest price per customer, and it is a service, so there is nothing to steal.
- Doesn't scale past your own hours.
- Good as a paid onboarding tier, bad as the whole business.

---

## 3. What I would actually do

**Sell A, offer C as paid setup, and don't sell B.**

The reason is not protection, it is product. This tool's value is that a lead *arrives
somewhere*. Strip the server out and you have a price calculator — and you already sell
a price calculator for $97. Option B would compete with Quick Quote Pro while being
easier to copy and worth less.

Quick Quote Pro stays the one-time product. This becomes the subscription. They are
different businesses and should not be collapsed into one.

**On pricing:** I don't have real market data for this niche, so treat anything I say
as a starting point for your own testing, not a recommendation to trust. The sensible
shape is a monthly subscription per business with a paid setup option on top. What the
market will actually bear, you'll learn from the first ten conversations — and your own
customers are the right people to ask, since four of them requested this unprompted.

The one thing I'd avoid is pricing it near $97. It invites the comparison to QQP, and
these aren't comparable things.

---

## 4. What a licence needs to say

Your QQP `LICENSE.txt` is already most of the way there. The clauses that matter:

1. **What they're buying.** A licence to *use* it, for one business. Not ownership of
   the software, and not a transfer of copyright.
2. **One business per licence.** Naming this explicitly is what makes reselling or
   sharing a breach rather than a grey area.
3. **No copying, reselling, or redistributing** the code, in whole or in part.
4. **No removing the Atlas attribution.** "Powered by Atlas" stays. This is both
   marketing and evidence — a copy in the wild still carries your name.
5. **Their data is theirs.** Their prices, their customers, their leads. Say so
   plainly; it's the thing they'll actually worry about.
6. **You own the software and every improvement to it.**
7. **No warranty, and a liability cap.** The estimate is an estimate. If a business
   under-quotes a job because they typed the wrong price, that is not on you — and the
   tool says "this is an estimate, not a final price" on every page partly for this
   reason.
8. **What happens when they stop paying.** Access ends, their data is exportable for
   some window, then deleted.

For the hosted version you also need a **privacy policy** and **terms of service**,
because you will be holding other people's customers' names and phone numbers. You
already have both pages on the Atlas site — they need updating to cover this.

---

## 5. Can this be written into someone's website?

Yes, and it already is — that is what `embed-snippet.html` does. Three ways, none of
which need a developer or custom CSS:

1. **Embed block.** They paste the snippet into an HTML / Custom Code / Embed element.
   Works on Bluehost, WordPress, Wix, Squarespace, GoDaddy and Shopify. The box resizes
   itself as sections open and close.
2. **A link.** Texted or emailed, or behind a "Get a Quote" button. Supports prefilling
   what you already know: `?name=John%20Doe&phone=4075550123`.
3. **Home screen app.** Add to Home Screen, same as Quick Quote Pro.

Worth knowing for the sales conversation: in the hosted model the embed is just an
`<iframe>` pointing at your server. The business's site never contains your code — only
a link to it. That is what makes "we license it to you, we don't give it to you"
technically true rather than just a sentence in a contract.
