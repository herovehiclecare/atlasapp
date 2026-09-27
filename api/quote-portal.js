// Serves the customer-facing interactive quote page. This is the customer's
// link - e.g. https://atlasapp-two.vercel.app/quote/<token> (rewritten to
// this function by vercel.json).
//
// Why this lives on Vercel and not as a Supabase Edge Function: Supabase's
// Edge Function gateway forces every response's Content-Type to text/plain
// (with a locked-down sandbox CSP), no matter what the function sets - a
// platform-level anti-phishing safeguard on the shared *.supabase.co
// domain that can't be turned off with headers or auth. That meant this
// page rendered as raw, unrendered HTML source text in real browsers
// instead of a webpage. Vercel doesn't apply that restriction, so the
// actual HTML is built and served from here; Supabase (supabase/functions/
// quote-portal) still owns the data (?format=json) and the approval write
// (POST), reached via server-to-server / same-path proxy calls below.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `${SUPABASE_URL}/functions/v1/quote-portal`;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(n) {
  return `$${(Number(n) || 0).toLocaleString()}`;
}

function effectiveInfo(service, overrides, id) {
  const o = overrides?.[id];
  return {
    name: service?.name || "Service",
    description: o?.description ?? service?.description ?? "",
    includes: o?.includes ?? service?.includes ?? [],
  };
}

function svcPrice(service, vehicle) {
  if (!service) return 0;
  const isSuv = vehicle?.size_class === "suv" || vehicle?.size_class === "truck" || vehicle?.size_class === "van";
  return Number(isSuv ? service.price_suv_low : service.price_car_low) || 0;
}

function renderPage(opts) {
  const { quote, business, customer, vehicle, services, addonsAll, extraAddonServices, alreadyApproved } = opts;
  const overrides = quote.service_overrides || {};
  const tiered = quote.proposal_mode === "tiered";
  const taxRate = Number(quote.tax_rate) || 0;
  const servicesById = Object.fromEntries(services.map((s) => [s.id, s]));
  const addonsById = Object.fromEntries(addonsAll.map((a) => [a.id, a]));

  const logoImg = business.logo_url
    ? `<img src="${esc(business.logo_url)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
    : "";

  let tiersHtml = "";
  let tabsHtml = "";
  const tierData = [];

  if (tiered) {
    for (const tier of quote.tiers || []) {
      const pkgRows = (tier.packageIds || []).map((id) => {
        const info = effectiveInfo(servicesById[id], overrides, id);
        const price = svcPrice(servicesById[id], vehicle);
        return { id, price, ...info };
      });
      const addonRows = (tier.addonIds || []).map((id) => {
        const a = addonsById[id];
        return { id, name: a?.name || "Add-on", price: Number(a?.price) || 0 };
      });
      const subtotal = pkgRows.reduce((s, r) => s + r.price, 0) + addonRows.reduce((s, r) => s + r.price, 0);
      tierData.push({ id: tier.id, name: tier.name, subtotal, addonIds: addonRows.map((r) => r.id) });

      tabsHtml += `<button class="tab" data-tier="${esc(tier.id)}" onclick="selectTier('${esc(tier.id)}')">${esc(tier.name)} — ${money(subtotal)}</button>`;

      const pkgHtml = pkgRows.map((r) => `
        <div class="item">
          <div class="item-row"><span class="item-name">${esc(r.name)}</span><span class="item-price">${money(r.price)}</span></div>
          ${r.description ? `<p class="item-desc">${esc(r.description)}</p>` : ""}
          ${r.includes.length ? `<ul class="item-list">${r.includes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        </div>`).join("");

      const addonHtml = addonRows.map((r) => `
        <label class="addon">
          <input type="checkbox" checked data-tier="${esc(tier.id)}" data-addon="${esc(r.id)}" data-price="${r.price}" onchange="updateTotal()">
          <span>${esc(r.name)}</span><b>${money(r.price)}</b>
        </label>`).join("");

      tiersHtml += `
        <div class="card" id="card-${esc(tier.id)}" data-tier="${esc(tier.id)}" style="display:none">
          <div class="card-head"><h2>${esc(tier.name)}</h2><span class="price">${money(subtotal)}</span></div>
          ${pkgHtml}
          ${addonRows.length ? `<div class="addons">${addonHtml}</div>` : ""}
        </div>`;
    }
  } else {
    const rows = [];
    for (const v of quote.line_items?.vehicleIds || []) {
      for (const id of quote.line_items?.byVehicle?.[v] || []) {
        const info = effectiveInfo(servicesById[id], overrides, id);
        rows.push({ id, price: svcPrice(servicesById[id], vehicle), ...info });
      }
    }
    const pkgHtml = rows.map((r) => `
      <div class="item">
        <div class="item-row"><span class="item-name">${esc(r.name)}</span><span class="item-price">${money(r.price)}</span></div>
        ${r.description ? `<p class="item-desc">${esc(r.description)}</p>` : ""}
        ${r.includes.length ? `<ul class="item-list">${r.includes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      </div>`).join("");
    const addonHtml = (quote.line_items?.addonIds || []).map((id) => {
      const a = addonsById[id];
      return `<label class="addon"><input type="checkbox" checked data-addon="${esc(id)}" data-price="${Number(a?.price) || 0}" onchange="updateTotal()"><span>${esc(a?.name || "Add-on")}</span><b>${money(Number(a?.price) || 0)}</b></label>`;
    }).join("");
    tiersHtml = `<div class="card" data-tier="single">${pkgHtml}${quote.line_items?.addonIds?.length ? `<div class="addons">${addonHtml}</div>` : ""}</div>`;
  }

  const defaultTierId = tierData[0]?.id || null;

  const extrasHtml = extraAddonServices.map((s) => {
    const price = svcPrice(s, vehicle);
    return `
      <label class="addon">
        <input type="checkbox" data-extra="${esc(s.id)}" data-price="${price}" onchange="updateTotal()">
        <span>${esc(s.name)}${s.description ? `<br><small>${esc(s.description)}</small>` : ""}</span><b>${money(price)}</b>
      </label>`;
  }).join("");

  const pageTitle = `${business.name || "Service"} — Quote for ${customer.name}`;
  const ogDescription = `Tap to view your interactive quote from ${business.name || "your detailer"}${vehicle ? ` for your ${vehicle.label}` : ""}.`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(ogDescription)}">
<meta property="og:title" content="${esc(`You have a proposal from ${business.name || "your detailer"}`)}">
<meta property="og:description" content="${esc(ogDescription)}">
<meta property="og:type" content="website">
${business.logo_url ? `<meta property="og:image" content="${esc(business.logo_url)}">` : ""}
<meta name="theme-color" content="#06100C">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #06100C; color: #EDF6F1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 28px 18px 60px; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .kicker { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #18D97A; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  .sub { font-size: 11px; color: #566B5E; letter-spacing: 0.05em; }
  .customer { margin-top: 20px; padding: 14px 16px; background: #0F1B15; border: 1px solid #1E2E25; border-radius: 12px; font-size: 13px; }
  .customer strong { font-size: 15px; }
  .customer .veh { color: #92AA9D; margin-top: 2px; }
  .tabs { display: flex; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
  .tab { flex: 1; min-width: 120px; background: #0F1B15; border: 1px solid #1E2E25; color: #92AA9D; border-radius: 9px; padding: 10px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .tab.active { background: rgba(24,217,122,0.14); border-color: #18D97A; color: #18D97A; }
  .card { margin-top: 16px; background: #0F1B15; border: 1px solid #1E2E25; border-radius: 14px; padding: 18px; }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .card-head h2 { font-size: 16px; margin: 0; }
  .card-head .price { font-size: 18px; font-weight: 800; color: #18D97A; }
  .item { margin-bottom: 12px; }
  .item-row { display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 600; }
  .item-desc { margin: 3px 0 0; font-size: 11.5px; color: #92AA9D; line-height: 1.5; }
  .item-list { margin: 4px 0 0; padding-left: 18px; }
  .item-list li { font-size: 11.5px; color: #92AA9D; line-height: 1.6; }
  .addons { margin-top: 8px; padding-top: 10px; border-top: 1px solid #1E2E25; display: flex; flex-direction: column; gap: 8px; }
  .addon { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .addon input { accent-color: #18D97A; width: 16px; height: 16px; }
  .addon span { flex: 1; }
  .addon small { color: #566B5E; font-weight: 400; }
  .extras { margin-top: 16px; background: #0F1B15; border: 1px solid #1E2E25; border-radius: 14px; padding: 16px 18px; }
  .extras .kicker { margin-bottom: 10px; display: block; }
  .extras-list { display: flex; flex-direction: column; gap: 10px; }
  .total { margin-top: 20px; display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; background: #0F1B15; border: 1px solid #1E2E25; border-radius: 14px; }
  .total span { font-size: 12px; color: #92AA9D; text-transform: uppercase; letter-spacing: 0.06em; }
  .total b { font-size: 24px; color: #EDF6F1; }
  .approve { width: 100%; margin-top: 16px; background: linear-gradient(120deg, #18D97A, #FF7A63); color: #06100C; border: none; border-radius: 12px; padding: 16px; font-size: 15px; font-weight: 800; cursor: pointer; }
  .approve:disabled { opacity: 0.6; cursor: default; }
  .note { margin-top: 14px; font-size: 11px; color: #566B5E; text-align: center; line-height: 1.6; }
  .approved-banner { margin-top: 16px; padding: 14px 16px; background: rgba(24,217,122,0.14); border: 1px solid #18D97A; border-radius: 12px; color: #18D97A; font-size: 13.5px; font-weight: 700; text-align: center; }
</style></head>
<body>
<div class="wrap">
  <div class="header">${logoImg}<div><div class="kicker">Service Quote</div><h1>${esc(business.name || "Your Business")}</h1>${business.tagline ? `<div class="sub">${esc(business.tagline)}</div>` : ""}</div></div>

  <div class="customer">
    <strong>${esc(customer.name)}</strong>
    ${vehicle ? `<div class="veh">${esc(vehicle.label)}</div>` : ""}
  </div>

  ${tiered ? `<div class="tabs">${tabsHtml}</div>` : ""}
  <div id="cards">${tiersHtml}</div>

  ${extraAddonServices.length ? `
  <div class="extras">
    <span class="kicker">Want to add anything?</span>
    <div class="extras-list">${extrasHtml}</div>
  </div>` : ""}

  <div class="total"><span>Total</span><b id="total">$0</b></div>

  ${alreadyApproved
    ? `<div class="approved-banner">✓ Approved — we'll be in touch to get this scheduled.</div>`
    : `<button class="approve" id="approveBtn" onclick="approve()">Approve Selected Package</button>`}

  <div class="note">Quote prepared ${esc(new Date(quote.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))} · Valid 14 days${business.phone ? ` · Questions? ${esc(business.phone)}` : ""}</div>
</div>

<script>
  const TIERED = ${tiered};
  const TAX_RATE = ${taxRate};
  const TOKEN = ${JSON.stringify(quote.share_token)};
  let selectedTier = ${JSON.stringify(defaultTierId)};

  function selectTier(id) {
    selectedTier = id;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tier === id));
    document.querySelectorAll('.card[data-tier]').forEach(c => c.style.display = c.dataset.tier === id ? 'block' : 'none');
    updateTotal();
  }

  function updateTotal() {
    let subtotal = 0;
    if (TIERED) {
      const card = document.getElementById('card-' + selectedTier);
      if (card) {
        card.querySelectorAll('.item-price').forEach(el => { subtotal += parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0; });
        card.querySelectorAll('input[data-addon]').forEach(cb => { if (!cb.checked) subtotal -= parseFloat(cb.dataset.price) || 0; });
      }
    } else {
      document.querySelectorAll('.item-price').forEach(el => { subtotal += parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0; });
      document.querySelectorAll('input[data-addon]').forEach(cb => { if (!cb.checked) subtotal -= parseFloat(cb.dataset.price) || 0; });
    }
    document.querySelectorAll('input[data-extra]').forEach(cb => { if (cb.checked) subtotal += parseFloat(cb.dataset.price) || 0; });
    const total = subtotal * (1 + TAX_RATE / 100);
    document.getElementById('total').textContent = '$' + total.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  async function approve() {
    const btn = document.getElementById('approveBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    const chosenAddonIds = [];
    document.querySelectorAll('input[data-addon]').forEach(cb => {
      if (cb.checked && (!TIERED || cb.dataset.tier === selectedTier)) chosenAddonIds.push(cb.dataset.addon);
    });
    const extraServiceIds = [];
    document.querySelectorAll('input[data-extra]').forEach(cb => { if (cb.checked) extraServiceIds.push(cb.dataset.extra); });
    try {
      const res = await fetch(window.location.pathname + window.location.search, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, chosenTierId: TIERED ? selectedTier : null, chosenAddonIds, extraServiceIds }),
      });
      if (!res.ok) throw new Error('failed');
      btn.outerHTML = '<div class="approved-banner">✓ Approved — we\\'ll be in touch to get this scheduled.</div>';
    } catch {
      btn.disabled = false;
      btn.textContent = 'Approve Selected Package';
      alert('Something went wrong submitting your approval — please try again or call us directly.');
    }
  }

  if (TIERED && selectedTier) selectTier(selectedTier);
  else updateTotal();
</script>
</body></html>`;
}

function notFoundPage() {
  return "<!doctype html><html><body style='font-family:sans-serif;padding:40px;text-align:center;color:#666'>This quote link isn't valid. Please check with the business that sent it.</body></html>";
}

export default async function handler(req, res) {
  const token = req.query.token;
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  if (req.method === "POST") {
    const upstream = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify(req.body || {}),
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
  const html = renderPage(data);
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
}
