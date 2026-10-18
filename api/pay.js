// Customer-facing "pay your invoice" page: https://atlasapp-two.vercel.app/pay/<pay_token>
// (rewritten here by vercel.json). Same reason as quote-portal.js: Supabase edge functions
// can't serve HTML, so this renders the page and proxies data/POSTs to the invoice-pay function.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `${SUPABASE_URL}/functions/v1/invoice-pay`;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderPage(data, justPaid) {
  const { invoice, customer, vehicle, business, canPayOnline } = data;
  const paid = invoice.status === "paid";
  const first = (customer.name || "").split(" ")[0];
  const items = (invoice.line_items || []).map((li) => ({ name: li.name, price: Number(li.price) || 0 }));
  const itemsTotal = items.reduce((s, li) => s + li.price, 0);
  const taxDiff = items.length ? Math.round((invoice.amount - itemsTotal) * 100) / 100 : 0;
  const shortId = String(invoice.id).slice(0, 8).toUpperCase();
  const logo = business.logo_url
    ? `<img src="${esc(business.logo_url)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
    : "";
  const title = `Invoice from ${business.name || "your detailer"}`;

  let action = "";
  if (paid) {
    action = `<div class="paid-banner">✓ Paid${invoice.paid_at ? ` on ${esc(new Date(invoice.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}` : ""}. Thank you${first ? `, ${esc(first)}` : ""}!</div>`;
  } else if (canPayOnline) {
    action = `
  <div class="card tipcard">
    <div class="kicker">Add a tip <small>(optional)</small></div>
    <div class="tips">
      <button type="button" class="tip on" data-pct="0">No tip</button>
      <button type="button" class="tip" data-pct="10">10%</button>
      <button type="button" class="tip" data-pct="15">15%</button>
      <button type="button" class="tip" data-pct="20">20%</button>
    </div>
  </div>
  <div class="total"><span>Total to pay</span><b id="grand">${money(invoice.amount)}</b></div>
  <button class="pay" id="payBtn">Pay ${money(invoice.amount)} by card</button>
  <div class="err" id="err" hidden></div>
  <div class="note">Secure checkout by Stripe. Apple Pay and Google Pay accepted where available.</div>`;
  } else {
    action = `<div class="card"><div class="kicker">How to pay</div><div class="plain">Online payment isn't available for this invoice yet. Please pay ${esc(business.name || "the business")} directly${business.phone ? ` — call or text ${esc(business.phone)}` : ""}.</div></div>`;
  }

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<meta name="theme-color" content="#06100C">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #06100C; color: #EDF6F1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 28px 18px 60px; }
  .header { display: flex; align-items: center; gap: 12px; }
  .kicker { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #18D97A; }
  .kicker small { color: #566B5E; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11px; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  .sub { font-size: 11px; color: #566B5E; letter-spacing: 0.05em; }
  .card { margin-top: 16px; background: #0F1B15; border: 1px solid #1E2E25; border-radius: 14px; padding: 16px 18px; }
  .meta { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: #92AA9D; margin-bottom: 12px; }
  .meta b { color: #EDF6F1; font-size: 14px; }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; padding: 6px 0; }
  .row.muted { color: #92AA9D; font-size: 12.5px; }
  .tips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
  .tip { background: #0A140F; border: 1px solid #1E2E25; color: #EDF6F1; border-radius: 10px; padding: 11px 4px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .tip.on { border-color: #18D97A; background: rgba(24,217,122,0.12); color: #18D97A; }
  .total { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; background: #0F1B15; border: 1px solid #1E2E25; border-radius: 14px; }
  .total span { font-size: 12px; color: #92AA9D; text-transform: uppercase; letter-spacing: 0.06em; }
  .total b { font-size: 24px; }
  .pay { width: 100%; margin-top: 16px; background: linear-gradient(120deg, #18D97A, #FF7A63); color: #06100C; border: none; border-radius: 12px; padding: 16px; font-size: 15px; font-weight: 800; cursor: pointer; }
  .pay:disabled { opacity: 0.6; cursor: default; }
  .err { margin-top: 12px; padding: 11px 14px; border-radius: 10px; background: rgba(255,90,90,0.1); border: 1px solid #5a2a2a; color: #ff9b9b; font-size: 12.5px; }
  .note { margin-top: 14px; font-size: 11px; color: #566B5E; text-align: center; line-height: 1.6; }
  .plain { font-size: 13px; color: #C7D6CD; line-height: 1.6; margin-top: 8px; }
  .paid-banner { margin-top: 16px; padding: 16px; background: rgba(24,217,122,0.14); border: 1px solid #18D97A; border-radius: 12px; color: #18D97A; font-size: 14px; font-weight: 700; text-align: center; }
  .processing { margin-top: 16px; padding: 14px 16px; background: rgba(24,217,122,0.08); border: 1px solid #1E2E25; border-radius: 12px; color: #C7D6CD; font-size: 13px; text-align: center; }
</style></head>
<body>
<div class="wrap">
  <div class="header">${logo}<div><div class="kicker">Invoice</div><h1>${esc(business.name || "Your Detailer")}</h1>${business.tagline ? `<div class="sub">${esc(business.tagline)}</div>` : ""}</div></div>

  <div class="card">
    <div class="meta"><div><b>${esc(customer.name)}</b>${vehicle ? `<br>${esc(vehicle)}` : ""}</div><div style="text-align:right">INV-${esc(shortId)}${invoice.due_date && !paid ? `<br>Due ${esc(invoice.due_date)}` : ""}</div></div>
    ${items.map((li) => `<div class="row"><span>${esc(li.name)}</span><span>${money(li.price)}</span></div>`).join("")}
    ${!items.length && invoice.description ? `<div class="row"><span>${esc(invoice.description)}</span></div>` : ""}
    ${taxDiff > 0 ? `<div class="row muted"><span>Tax</span><span>${money(taxDiff)}</span></div>` : ""}
    <div class="row" style="border-top:1px solid #1E2E25;margin-top:6px;padding-top:12px"><b>Invoice total</b><b>${money(invoice.amount)}</b></div>
  </div>
  ${justPaid && !paid ? `<div class="processing">Thanks! Your payment is going through — refresh in a moment to see it marked paid.</div>` : ""}
  ${action}
</div>
${!paid && canPayOnline ? `<script>
  const AMOUNT = ${Number(invoice.amount) || 0};
  let pct = 0;
  const fmt = (n) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tipValue = () => Math.round(AMOUNT * pct) / 100;
  function refresh() {
    const total = AMOUNT + tipValue();
    document.getElementById('grand').textContent = fmt(total);
    document.getElementById('payBtn').textContent = 'Pay ' + fmt(total) + ' by card';
  }
  document.querySelectorAll('.tip').forEach((b) => b.addEventListener('click', () => {
    pct = Number(b.dataset.pct);
    document.querySelectorAll('.tip').forEach((x) => x.classList.toggle('on', x === b));
    refresh();
  }));
  document.getElementById('payBtn').addEventListener('click', async () => {
    const btn = document.getElementById('payBtn');
    const err = document.getElementById('err');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Opening secure checkout…';
    try {
      const r = await fetch(window.location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tip: tipValue() }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'failed');
      window.location.href = d.url;
    } catch (e) {
      err.textContent = e.message && e.message !== 'failed' ? e.message : 'Something went wrong. Please try again or pay the business directly.';
      err.hidden = false;
      btn.disabled = false;
      refresh();
    }
  });
</script>` : ""}
</body></html>`;
}

function notFoundPage() {
  return "<!doctype html><html><body style='font-family:sans-serif;padding:40px;text-align:center;color:#666'>This invoice link isn't valid. Please check with the business that sent it.</body></html>";
}

export default async function handler(req, res) {
  const token = req.query.token;
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  if (req.method === "POST") {
    const upstream = await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ ...(req.body || {}), token }),
    });
    const data = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").send(data);
    return;
  }

  const upstream = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}&format=json`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!upstream.ok) {
    res.status(upstream.status === 404 ? 404 : 502).setHeader("Content-Type", "text/html; charset=utf-8").send(notFoundPage());
    return;
  }
  const data = await upstream.json();
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").setHeader("Cache-Control", "no-store").send(renderPage(data, req.query.paid === "1"));
}
