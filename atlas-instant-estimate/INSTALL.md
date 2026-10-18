# Atlas Instant Quote — setup guide

Two halves: what the business owner does once, and how it goes on their website.
Written so you can walk someone through it on the phone.

---

## Part 1 — Set it up (about 10 minutes, once)

Open your quote page and tap the **gear** in the top right. Everything a customer
sees comes out of these three tabs. Your customers never see the gear.

### Brand
- **Logo** — upload yours. Square works best; it gets cropped and resized for you.
- **Business name**, **small line above it**, **tagline**
- **Phone** and **email** — these become the Call / Text / Email buttons at the bottom
- **How fast you reply** — shows on the confirmation screen ("within 1 business hour")
- **Accent colour** — pick a swatch or tap the last one for your exact brand colour.
  This drives the whole page: buttons, prices, the glow and the hex pattern.
- **Background** — Forest, Midnight, Charcoal or Light
- **Hex pattern** — On, Subtle or Off
- **Social links** — each icon only appears if you fill that one in

"Powered by Atlas" stays at the bottom. Everything above it is yours.

### Services
This is your price list, and it is the part that matters most.

Each service is a row. Tap one to open it:
- **Category** — how it's grouped for the customer (Maintenance, Ceramic Coating…)
- **Service name** and a **short description**
- **Four prices** — a low and a high for each of your two size tiers

> **Leave the High box empty** and the customer sees "from $600" instead of a range.
> Use that for jobs you can't price without seeing them.

**+ Add a service** for anything missing. **Delete service** removes it.
Add-ons go underneath — just a name and one price each.

### Questions
- **Trade** — Auto Detailing, Junk Removal or Pressure Washing. Switching this changes
  the questions, the size tiers and the starting price list. **Do this first**, because
  it replaces the catalog.
- **What you ask them for** — the fields at the top. Detailing asks Year / Make / Model;
  junk removal asks what needs removing and where it is. Rename, add or delete these.
- **Size tiers** — rename the two options to match your work
- **Condition levels** — Light / Moderate / Heavy by default. Rename them, add more,
  or delete down to one. They run cheapest to dearest.
- **Timing question** and its **%** — this only ever raises the *top* of the range,
  never the bottom, so you can't end up promising less than you priced.
- **Page wording** — headline, the line under it, and both step labels

### How the price is worked out
Your low–high price is the band. **Condition** decides where in that band the customer
lands: the first level sits at the bottom, the last at the top. **Timing** adds a
percentage to the top only. A clean car sees the bottom of your range; a truck that
hasn't been touched in a year sees the top. Same price list, honest answer either way.

---

## Part 2 — Put it on your website

Pick one. None of these need a developer or custom CSS.

### A. Embed it in a page (recommended)

1. Open `embed-snippet.html` and copy everything in it.
2. Replace `YOUR-LINK-HERE` with your quote page address. **Only change that one line.**
3. In your website editor, add an HTML / Custom Code / Embed block and paste it in.

Where that block lives:
- **WordPress** — add a *Custom HTML* block
- **Wix / Squarespace** — add an *Embed* or *Code* block
- **Bluehost site builder** — add an *HTML* / *Embed Code* element
- **Shopify** — Online Store → Pages → open the code editor (`< >`)
- **GoDaddy** — add an *HTML* section

The box grows and shrinks as the customer opens sections, so there's no inner
scrollbar and no empty gap underneath.

### B. Send it as a link

The page is just a web address — text it, email it, put it behind a "Get a Quote"
button, or print it as a QR code.

Fill in what you already know:

```
https://your-link/?name=John%20Doe&phone=4075550123
```

They open it with their details already in. A plain link with nothing after it works
exactly the same.

### C. Put it on your phone's home screen

Open the link on your phone and tap **Add to Home Screen**. Same as Quick Quote Pro.

---

## Part 3 — Walking a customer through it (consultant script)

1. **Ask what they currently do.** Almost everyone says "they call or message and I
   give them a number." Good — that's the problem.
2. **Show them the demo on your phone.** Pick a service, then switch Moderate to Heavy
   and let them watch the number move. That is the moment it lands.
3. **Explain the honesty angle.** It never quotes below what they set, and it says
   "this is an estimate, not a final price" on every page. They stay in control of the
   final number.
4. **Set it up with them on the call.** Their logo, their colour, their five most
   common services. Ten minutes, and now it's *their* tool.
5. **Install it or hand it over.** Either you paste the embed for them, or you send the
   snippet and the three lines above.

**Objections you'll actually hear:**
- *"I don't want my prices public."* The range only shows after they've answered — and
  you can leave the High box blank so it shows "from $X" instead.
- *"My jobs are all different."* That's exactly why it's a range and not a price, and
  why condition moves it.
- *"I'm not technical."* It's one paste into their website, or no website at all —
  just a link they text.

---

## Troubleshooting

**The box is too short / has its own scrollbar.** The resize script didn't load. Check
the `<script>` part of the snippet was pasted too, not just the iframe.

**My settings disappeared.** Settings are saved in the browser you set them in. A
different device, a different browser, or clearing site data starts fresh. The hosted
version keeps them on your account instead.

**The colours look wrong on a light background.** Switch Background to **Light** in the
Brand tab — the whole page re-tunes for a pale ground.

**Nothing happens when I press Send.** In the demo, Send shows the confirmation screen
but doesn't deliver anywhere yet. The live version writes the request into the
business's Atlas account and texts them.
