import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Serves the customer-facing interactive quote page directly (GET) and
// handles the customer's Approve tap (POST) - both at the same URL, keyed
// by quotes.share_token (an unguessable random token, not the row's real
// id, so a customer's link can only ever read/affect their own quote).
//
// This function IS the customer's link - e.g.
//   https://<project>.supabase.co/functions/v1/quote-portal?token=<token>
// There's no separate frontend route for this; the whole page (styling,
// tier/add-on toggling, live total, the Approve POST) is generated and
// served here as one self-contained HTML document, same shape as the
// original static mockup this was modeled on, just driven by real data.
//
// Optional secrets (same ones facebook-lead-webhook already uses, reused
// here for the "customer approved" alert):
//   OPENPHONE_API_KEY / OPENPHONE_FROM_NUMBER / OWNER_ALERT_PHONE

const OPENPHONE_API_KEY = Deno.env.get("OPENPHONE_API_KEY") || "";
const OPENPHONE_FROM_NUMBER = Deno.env.get("OPENPHONE_FROM_NUMBER") || "";
const OWNER_ALERT_PHONE = Deno.env.get("OWNER_ALERT_PHONE") || "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function money(n: number): string {
  return `$${(Number(n) || 0).toLocaleString()}`;
}

async function sendApprovalAlert(businessId: string, customerName: string, chosenLabel: string, total: number) {
  if (!OPENPHONE_API_KEY || !OPENPHONE_FROM_NUMBER || !OWNER_ALERT_PHONE) return;
  try {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date());
    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: OPENPHONE_API_KEY },
      body: JSON.stringify({
        content: `${customerName} approved their quote at ${time}${chosenLabel ? ` (${chosenLabel})` : ""} — ${money(total)}. Get it booked!`,
        from: OPENPHONE_FROM_NUMBER,
        to: [OWNER_ALERT_PHONE],
      }),
    });
    if (!res.ok) console.error("Approval alert text failed", res.status, await res.text());
  } catch (err) {
    console.error("Approval alert text threw", err);
  }
}

function effectiveInfo(service: any, overrides: Record<string, any>, id: string) {
  const o = overrides?.[id];
  return {
    name: service?.name || "Service",
    description: o?.description ?? service?.description ?? "",
    includes: o?.includes ?? service?.includes ?? [],
  };
}

function svcPrice(service: any, vehicle: any): number {
  if (!service) return 0;
  const isSuv = vehicle?.size_class === "suv" || vehicle?.size_class === "truck" || vehicle?.size_class === "van";
  return Number(isSuv ? service.price_suv_low : service.price_car_low) || 0;
}

function renderPage(opts: {
  quote: any; business: any; customer: any; vehicle: any;
  services: any[]; addonsAll: any[]; alreadyApproved: boolean;
}) {
  const { quote, business, customer, vehicle, services, addonsAll, alreadyApproved } = opts;
  const overrides = quote.service_overrides || {};
  const tiered = quote.proposal_mode === "tiered";
  const taxRate = Number(quote.tax_rate) || 0;
  const servicesById = Object.fromEntries(services.map((s: any) => [s.id, s]));
  const addonsById = Object.fromEntries(addonsAll.map((a: any) => [a.id, a]));

  const logoImg = business.logo_url
    ? `<img src="${esc(business.logo_url)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
    : "";

  let tiersHtml = "";
  let tabsHtml = "";
  const tierData: any[] = [];

  if (tiered) {
    for (const tier of quote.tiers || []) {
      const pkgRows = (tier.packageIds || []).map((id: string) => {
        const info = effectiveInfo(servicesById[id], overrides, id);
        const price = svcPrice(servicesById[id], vehicle);
        return { id, price, ...info };
      });
      const addonRows = (tier.addonIds || []).map((id: string) => {
        const a = addonsById[id];
        return { id, name: a?.name || "Add-on", price: Number(a?.price) || 0 };
      });
      const subtotal = pkgRows.reduce((s: number, r: any) => s + r.price, 0) + addonRows.reduce((s: number, r: any) => s + r.price, 0);
      tierData.push({ id: tier.id, name: tier.name, subtotal, addonIds: addonRows.map((r: any) => r.id) });

      tabsHtml += `<button class="tab" data-tier="${esc(tier.id)}" onclick="selectTier('${esc(tier.id)}')">${esc(tier.name)} — ${money(subtotal)}</button>`;

      const pkgHtml = pkgRows.map((r: any) => `
        <div class="item">
          <div class="item-row"><span class="item-name">${esc(r.name)}</span><span class="item-price">${money(r.price)}</span></div>
          ${r.description ? `<p class="item-desc">${esc(r.description)}</p>` : ""}
          ${r.includes.length ? `<ul class="item-list">${r.includes.map((l: string) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        </div>`).join("");

      const addonHtml = addonRows.map((r: any) => `
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
    const rows: any[] = [];
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
        ${r.includes.length ? `<ul class="item-list">${r.includes.map((l: string) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      </div>`).join("");
    const addonHtml = (quote.line_items?.addonIds || []).map((id: string) => {
      const a = addonsById[id];
      return `<label class="addon"><input type="checkbox" checked data-addon="${esc(id)}" data-price="${Number(a?.price) || 0}" onchange="updateTotal()"><span>${esc(a?.name || "Add-on")}</span><b>${money(Number(a?.price) || 0)}</b></label>`;
    }).join("");
    tiersHtml = `<div class="card" data-tier="single">${pkgHtml}${quote.line_items?.addonIds?.length ? `<div class="addons">${addonHtml}</div>` : ""}</div>`;
  }

  const defaultTierId = tierData[0]?.id || null;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(business.name || "Service")} — Quote for ${esc(customer.name)}</title>
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
        card.querySelectorAll('input[type=checkbox]').forEach(cb => { if (!cb.checked) subtotal -= parseFloat(cb.dataset.price) || 0; });
      }
    } else {
      document.querySelectorAll('.item-price').forEach(el => { subtotal += parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0; });
      document.querySelectorAll('input[type=checkbox]').forEach(cb => { if (!cb.checked) subtotal -= parseFloat(cb.dataset.price) || 0; });
    }
    const total = subtotal * (1 + TAX_RATE / 100);
    document.getElementById('total').textContent = '$' + total.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  async function approve() {
    const btn = document.getElementById('approveBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    const chosenAddonIds = [];
    document.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (cb.checked && (!TIERED || cb.dataset.tier === selectedTier)) chosenAddonIds.push(cb.dataset.addon);
    });
    try {
      const res = await fetch(window.location.pathname + window.location.search, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, chosenTierId: TIERED ? selectedTier : null, chosenAddonIds }),
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, customers(name, email, phone), businesses(name, logo_url, tagline, phone, email, address)")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !quote) {
    return new Response("<!doctype html><html><body style='font-family:sans-serif;padding:40px;text-align:center;color:#666'>This quote link isn't valid. Please check with the business that sent it.</body></html>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  const vehicleIds: string[] = quote.line_items?.vehicleIds || [];
  const { data: vehicles } = vehicleIds.length
    ? await supabase.from("vehicles").select("id, label, size_class").in("id", vehicleIds)
    : { data: [] };
  const vehicle = vehicles?.[0] || null;

  const serviceIds = new Set<string>();
  if (quote.proposal_mode === "tiered") {
    for (const t of quote.tiers || []) for (const id of t.packageIds || []) serviceIds.add(id);
  } else {
    for (const v of quote.line_items?.vehicleIds || []) for (const id of quote.line_items?.byVehicle?.[v] || []) serviceIds.add(id);
  }
  const addonIds = new Set<string>();
  if (quote.proposal_mode === "tiered") {
    for (const t of quote.tiers || []) for (const id of t.addonIds || []) addonIds.add(id);
  } else {
    for (const id of quote.line_items?.addonIds || []) addonIds.add(id);
  }

  const [{ data: services }, { data: addonsAll }] = await Promise.all([
    serviceIds.size ? supabase.from("services").select("id, name, description, includes, price_car_low, price_suv_low").in("id", [...serviceIds]) : Promise.resolve({ data: [] }),
    addonIds.size ? supabase.from("addons").select("id, name, price").in("id", [...addonIds]) : Promise.resolve({ data: [] }),
  ]);

  if (req.method === "GET") {
    const html = renderPage({
      quote,
      business: quote.businesses || {},
      customer: quote.customers || { name: "Customer" },
      vehicle,
      services: services || [],
      addonsAll: addonsAll || [],
      alreadyApproved: ["approved", "booked"].includes(quote.status),
    });
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (req.method === "POST") {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const chosenTierId = body.chosenTierId || null;
    const chosenAddonIds = Array.isArray(body.chosenAddonIds) ? body.chosenAddonIds : [];

    let total = 0;
    const servicesById = Object.fromEntries((services || []).map((s: any) => [s.id, s]));
    const addonsById = Object.fromEntries((addonsAll || []).map((a: any) => [a.id, a]));
    let chosenLabel = "";
    if (quote.proposal_mode === "tiered") {
      const tier = (quote.tiers || []).find((t: any) => t.id === chosenTierId);
      if (tier) {
        chosenLabel = tier.name;
        total += (tier.packageIds || []).reduce((s: number, id: string) => s + svcPrice(servicesById[id], vehicle), 0);
        total += (tier.addonIds || []).filter((id: string) => chosenAddonIds.includes(id)).reduce((s: number, id: string) => s + (Number(addonsById[id]?.price) || 0), 0);
      }
    } else {
      for (const v of quote.line_items?.vehicleIds || []) {
        for (const id of quote.line_items?.byVehicle?.[v] || []) total += svcPrice(servicesById[id], vehicle);
      }
      total += chosenAddonIds.reduce((s: number, id: string) => s + (Number(addonsById[id]?.price) || 0), 0);
    }
    total *= 1 + (Number(quote.tax_rate) || 0) / 100;

    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        status: "approved",
        chosen_tier_id: chosenTierId,
        chosen_addon_ids: chosenAddonIds,
        approved_at: new Date().toISOString(),
      })
      .eq("id", quote.id);
    if (updateError) {
      console.error("Failed to record approval", quote.id, updateError.message);
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Same "real action closes an open follow-up" behavior as everywhere
    // else in Atlas - approving a quote is exactly that kind of action.
    if (quote.customer_id) {
      await supabase.from("follow_ups").update({ status: "done", completed_at: new Date().toISOString() }).eq("status", "pending").contains("customer_ids", [quote.customer_id]);
    }

    await sendApprovalAlert(quote.business_id, quote.customers?.name || "A customer", chosenLabel, total);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  return new Response("Not found", { status: 404 });
});
