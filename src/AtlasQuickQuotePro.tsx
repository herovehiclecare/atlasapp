import { useState, useRef, useMemo, useEffect } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Sparkles,
  MoreHorizontal, Pencil, Camera, Check, ChevronLeft, ChevronRight,
  Search, Plus, X, Image as ImageIcon, Mail, MessageSquare, FileText,
  Wand2, ArrowRight, Loader2, Download, FileSpreadsheet, CalendarPlus,
  UserPlus, Settings2, Copy, Trash2, Eye, Save, Link2, Layers, ListChecks,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { formatDate, shortId, printWhenReady, findService, svcPrice, resizeImageToDataUrl } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = ["#18D97A", "#4C8DFF", "#9B6BFF", "#F5A623", "#FF7A63", "#4FD1C5"];

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-quote2";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs><radialGradient id={gid} cx="36%" cy="30%" r="75%"><stop offset="0%" stopColor={P.accentHover} /><stop offset="100%" stopColor={P.accent} /></radialGradient></defs>
      <path d="M18 82 L49 33 L51 33 L82 82" stroke={P.accent} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="31" r="18" fill={`url(#${gid})`} />
      <ellipse cx="44" cy="24" rx="6.5" ry="4.2" fill="rgba(255,255,255,0.38)" />
    </svg>
  );
}

const NAV = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid }, { id: "customers", label: "Customers", Icon: Users },
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "schedule", label: "Schedule", Icon: Calendar }, { id: "followups", label: "Follow-ups", Icon: ListChecks },
  { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "settings", label: "Settings", Icon: Settings },
];
const MOBILE_NAV = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid }, { id: "schedule", label: "Schedule", Icon: Calendar },
  { id: "customers", label: "Clients", Icon: Users }, { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "more", label: "More", Icon: MoreHorizontal },
];
// Pages that don't fit in the 5-slot mobile bottom bar — "More" opens a sheet listing these.
const MORE_PAGES = [
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "followups", label: "Follow-ups", Icon: ListChecks }, { id: "settings", label: "Settings", Icon: Settings },
];

const STEPS = ["Customer", "Vehicles", "Services", "Customize", "Photos", "Review", "Send"];

const DEFAULT_SCRIPT =
  "Hi {customer_first}, thanks for reaching out! For your {vehicle}, we're looking at {price_low}–{price_high} for {service_summary}. Want me to lock in a time this week?";

const TIER_NAMES = ["Essential", "Signature", "Premium"];

function hue(i) { return HUES[i % HUES.length]; }
function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }
function money(n) { return `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function findAddon(addonsAll, id) { return addonsAll.find((a) => a.id === id); }

function tierBase(tier, vehicle, services, addonsAll) {
  const pkgTotal = (tier.packageIds || []).reduce((s, id) => s + svcPrice(findService(services, id), vehicle), 0);
  const addonTotal = (tier.addonIds || []).reduce((s, id) => s + (Number(findAddon(addonsAll, id)?.price) || 0), 0);
  return pkgTotal + addonTotal;
}

function tierTotalWithTax(tier, vehicle, services, addonsAll, taxRate) {
  const base = tierBase(tier, vehicle, services, addonsAll);
  const tax = base * (taxRate / 100);
  return { base, tax, total: base + tax };
}

// These three categories are naturally three different price points, so
// picking one representative service from each gives a real low/mid/high
// spread instead of leaning on a price-percentile guess.
const SUGGESTED_TIER_CATEGORIES = ["Maintenance Detailing", "Paint Correction & Ceramic (CPR)", "Graphene Coating"];

// Categories are free text set per-business in Settings, so an exact-string
// match would silently fail on nothing more than a casing or whitespace
// difference — normalize both sides before comparing.
function normalizeCategory(c) { return (c || "").trim().toLowerCase(); }

function cheapestInCategory(services, category, vehicle) {
  const target = normalizeCategory(category);
  const options = services.filter((s) => normalizeCategory(s.category) === target);
  if (!options.length) return null;
  return [...options].sort((a, b) => svcPrice(a, vehicle) - svcPrice(b, vehicle))[0];
}

// Auto-builds up to 3 starter tiers so "Give them options" isn't a blank
// slate. Priced for the actual vehicle (car vs. suv/truck/van) since that
// changes which price bound applies. Falls back to a low/mid/high price
// spread across all services if the business's catalog doesn't use the
// three named categories above.
function suggestTiers(services, vehicle) {
  let picks = SUGGESTED_TIER_CATEGORIES.map((cat) => cheapestInCategory(services, cat, vehicle)).filter(Boolean);

  if (picks.length < 2) {
    const sorted = [...services].sort((a, b) => svcPrice(a, vehicle) - svcPrice(b, vehicle));
    picks = sorted.length <= 3
      ? sorted
      : [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted[sorted.length - 1]];
  }

  // Dedupe by the package actually shown (name + price), not just row id —
  // a catalog with only one real service configured (or several rows that
  // share a name/price) would otherwise still fill all 3 slots and render
  // as multiple "different" tiers that are actually identical to the eye.
  const seen = new Set();
  const unique = picks.filter((p) => {
    const key = `${(p.name || "").trim().toLowerCase()}|${svcPrice(p, vehicle)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map((p, i) => ({
    id: `tier-${Date.now()}-${i}`,
    name: TIER_NAMES[i] || `Option ${i + 1}`,
    packageIds: [p.id],
    addonIds: [],
  }));
}

function fillScript(template, ctx) {
  return (template || "")
    .replace(/\{customer_first\}/g, ctx.customerFirst || "there")
    .replace(/\{vehicle\}/g, ctx.vehicle || "your vehicle")
    .replace(/\{price_low\}/g, ctx.priceLow != null ? money(ctx.priceLow) : "—")
    .replace(/\{price_high\}/g, ctx.priceHigh != null ? money(ctx.priceHigh) : "—")
    .replace(/\{service_summary\}/g, ctx.serviceSummary || "the requested service");
}

function downloadText(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function icsDate(d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }

function buildICS({ title, notes, start }) {
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `UID:${Date.now()}@atlas.app`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(notes || "").replace(/\n/g, "\\n")}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function buildVCard(c) {
  return [
    "BEGIN:VCARD", "VERSION:3.0",
    `FN:${c.name}`,
    `TEL;TYPE=CELL:${c.phone || ""}`,
    `EMAIL:${c.email || ""}`,
    "END:VCARD",
  ].join("\r\n");
}

function quotesToCSV(quotes) {
  const header = ["Quote ID", "Customer", "Vehicle(s)", "Type", "Total", "Status", "Date"];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = quotes.map((q) => [
    shortId(q.id),
    q.customerName,
    q.vehicleSummary,
    q.proposalMode === "tiered" ? "Tiered" : "Single",
    q.totals.isRange ? `${q.totals.rangeLow.toFixed(2)}–${q.totals.rangeHigh.toFixed(2)}` : q.totals.total.toFixed(2),
    q.status,
    q.createdAt,
  ]);
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

// Reconstructs the UI's quote shape from a DB row: the row's line_items jsonb
// carries vehicleIds/addonIds/byVehicle alongside the FK'd customer join,
// since quotes has no dedicated columns for the vehicles or add-ons picked.
function hydrateQuote(row, vehiclesById) {
  const li = row.line_items || {};
  const vehicleIds = li.vehicleIds || [];
  const vehicles = vehicleIds.map((id) => vehiclesById[id]).filter(Boolean);
  const customer = row.customer_id
    ? { id: row.customer_id, name: row.customers?.name || "No customer", email: row.customers?.email, phone: row.customers?.phone }
    : null;
  return {
    id: row.id,
    status: row.status,
    createdAt: formatDate(row.created_at),
    customer,
    customerName: customer?.name || "No customer",
    vehicles,
    vehicleSummary: vehicles.map((v) => v.label).join(", ") || "—",
    proposalMode: row.proposal_mode,
    lineItems: li.byVehicle || {},
    tiers: row.tiers || [],
    addons: li.addonIds || [],
    discount: Number(row.discount) || 0,
    taxRate: Number(row.tax_rate) || 0,
    totals: row.totals && Object.keys(row.totals).length ? row.totals : { subtotal: 0, tax: 0, total: 0, isRange: false },
    description: row.description || "",
  };
}

/* ---------------------------------- shared chrome ---------------------------------- */

function NavItem({ item, active, onClick }) {
  const { Icon, label } = item;
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left", background: active ? P.surfaceHover : "transparent", color: active ? P.textPrimary : P.textSecondary }}>
      <Icon size={17} color={active ? P.accent : P.textMuted} />
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
    </button>
  );
}

function BrandLockup({ size = 30, businessId, realName, realLogoUrl }) {
  const [logo, setLogo] = useState(null);
  const [name, setName] = useState("Detail Hero");
  const [editingName, setEditingName] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (realLogoUrl !== undefined) setLogo(realLogoUrl || null); }, [realLogoUrl]);
  useEffect(() => { if (realName) setName(realName); }, [realName]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setLogo(dataUrl);
      const { error } = await supabase.from("businesses").update({ logo_url: dataUrl }).eq("id", businessId).select().single();
      if (error) throw error;
    } catch (err) {
      alert(err.message || "Couldn't save that logo.");
    }
  }
  async function commitName() {
    setEditingName(false);
    if (businessId && name.trim()) await supabase.from("businesses").update({ name: name.trim() }).eq("id", businessId);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={() => fileRef.current?.click()} title="Change logo" style={{ position: "relative", width: size, height: size, borderRadius: "50%", border: `1px solid ${P.border}`, background: logo ? `url(${logo}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
        {!logo && <span style={{ fontSize: size * 0.36, fontWeight: 700, color: P.accent }}>{initials(name)}</span>}
        {!logo && <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: P.accent, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${P.bg}` }}><Camera size={9} color={P.bg} /></div>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      {editingName ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && commitName()} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${P.accent}`, color: P.textPrimary, fontSize: 15, fontWeight: 700, outline: "none", width: 140 }} />
      ) : (
        <button onClick={() => setEditingName(true)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{name}</span>
        </button>
      )}
    </div>
  );
}

function Stepper({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", padding: "2px 0" }}>
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "active" : "pending";
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10.5, fontWeight: 700, flexShrink: 0,
                background: state === "done" ? P.accent : state === "active" ? P.accentSoft : "transparent",
                border: state === "pending" ? `1px solid ${P.border}` : state === "active" ? `1px solid ${P.accent}` : "none",
                color: state === "done" ? P.bg : state === "active" ? P.accent : P.textMuted,
              }}>
                {state === "done" ? <Check size={12} /> : i + 1}
              </div>
              <span className="hidden md:inline" style={{ fontSize: 12, fontWeight: state === "active" ? 700 : 500, color: state === "pending" ? P.textMuted : P.textPrimary, whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: 18, height: 1, background: i < step ? P.accent : P.border, margin: "0 6px", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

function NavButtons({ step, setStep, canNext, onSend, sending }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
      <button
        onClick={() => setStep((s) => Math.max(0, s - 1))}
        disabled={step === 0}
        style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: step === 0 ? P.textMuted : P.textSecondary, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: step === 0 ? "default" : "pointer", opacity: step === 0 ? 0.5 : 1 }}
      >
        <ChevronLeft size={15} /> Back
      </button>
      {step < STEPS.length - 1 ? (
        <button
          onClick={() => canNext && setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={!canNext}
          style={{ display: "flex", alignItems: "center", gap: 6, background: canNext ? `linear-gradient(120deg, ${P.accent}, ${P.secondary})` : P.surface, color: canNext ? P.bg : P.textMuted, border: canNext ? "none" : `1px solid ${P.border}`, borderRadius: 9, padding: "10px 18px", fontSize: 13.5, fontWeight: 700, cursor: canNext ? "pointer" : "default" }}
        >
          Continue <ChevronRight size={15} />
        </button>
      ) : (
        <button
          onClick={onSend}
          disabled={sending}
          style={{ display: "flex", alignItems: "center", gap: 7, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 9, padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: sending ? "default" : "pointer", opacity: sending ? 0.85 : 1 }}
        >
          {sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <>Send Quote <ArrowRight size={15} /></>}
        </button>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, ...style }}>{children}</div>;
}

function StatusBadge({ status }) {
  const map = {
    draft: { bg: "rgba(146,170,157,0.15)", color: P.textSecondary, label: "Draft" },
    sent: { bg: "rgba(76,141,255,0.15)", color: "#4C8DFF", label: "Sent" },
    approved: { bg: P.accentSoft, color: P.accent, label: "Approved" },
  };
  const s = map[status] || map.draft;
  return <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 20, padding: "3px 9px", textTransform: "uppercase", letterSpacing: "0.03em", flexShrink: 0 }}>{s.label}</span>;
}

/* ---------------------------------- tiered proposals ---------------------------------- */

function TierBuilder({ vehicle, services, addonsAll, tiers, taxRate, onAddTier, onRemoveTier, onUpdateTierName, onTogglePackage, onToggleAddon }) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {tiers.map((tier) => {
          const { total } = tierTotalWithTax(tier, vehicle, services, addonsAll, taxRate);
          return (
            <Card key={tier.id} style={{ padding: "14px 16px", border: `1px solid ${P.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <input
                  value={tier.name}
                  onChange={(e) => onUpdateTierName(tier.id, e.target.value)}
                  style={{ background: "transparent", border: "none", borderBottom: `1px solid ${P.border}`, color: P.textPrimary, fontSize: 14.5, fontWeight: 700, outline: "none", padding: "2px 0", minWidth: 0, flex: 1 }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: P.accent, flexShrink: 0 }}>{money(total)}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {services.length === 0 && <p style={{ fontSize: 12, color: P.textMuted, fontStyle: "italic", margin: 0 }}>No services set up yet.</p>}
                {services.map((p) => {
                  const active = tier.packageIds.includes(p.id);
                  return (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: active ? P.accentSoft : "transparent", border: `1px solid ${active ? P.accent : P.border}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <input type="checkbox" checked={active} onChange={() => onTogglePackage(tier.id, p.id)} style={{ accentColor: P.accent, flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: P.textPrimary }}>{p.name}</span>
                      </span>
                      <span style={{ fontSize: 12, color: P.textSecondary, flexShrink: 0 }}>${svcPrice(p, vehicle)}</span>
                    </label>
                  );
                })}
              </div>

              {addonsAll.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {addonsAll.map((a) => {
                    const active = tier.addonIds.includes(a.id);
                    return (
                      <button key={a.id} onClick={() => onToggleAddon(tier.id, a.id)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 9px", borderRadius: 20, border: `1px solid ${active ? P.accent : P.border}`, background: active ? P.accentSoft : "transparent", color: active ? P.accent : P.textMuted, cursor: "pointer" }}>
                        + {a.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {tiers.length > 2 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => onRemoveTier(tier.id)} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><Trash2 size={13} /></button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {tiers.length < 3 && (
        <button onClick={onAddTier} style={{ marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 10, padding: "10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={13} /> Add another option
        </button>
      )}
    </div>
  );
}

function TiersPreview({ tiers, vehicle, services, addonsAll, taxRate, light }) {
  const textPrimary = light ? "#111" : P.textPrimary;
  const textMuted = light ? "#555" : P.textMuted;
  const border = light ? "#ddd" : P.border;
  return (
    <div className="tiers-preview-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(tiers.length, 1)}, minmax(0,1fr))`, gap: 10 }}>
      <style>{`@media (max-width: 640px) { .tiers-preview-grid { grid-template-columns: 1fr !important; } }`}</style>
      {tiers.map((tier) => {
        const { total } = tierTotalWithTax(tier, vehicle, services, addonsAll, taxRate);
        const names = [
          ...tier.packageIds.map((id) => findService(services, id)?.name).filter(Boolean),
          ...tier.addonIds.map((id) => findAddon(addonsAll, id)?.name).filter(Boolean),
        ];
        return (
          <div key={tier.id} style={{ border: `1px solid ${border}`, borderRadius: 12, padding: "14px 12px", background: light ? "#fff" : P.surface }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: textPrimary, marginBottom: 4, textAlign: "center" }}>{tier.name}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: light ? textPrimary : P.accent, textAlign: "center", marginBottom: 10 }}>{money(total)}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {names.map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: textMuted, textAlign: "center" }}>{n}</div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- step 1: customer ---------------------------------- */

function StepCustomer({ customers, customer, setCustomer, onNavigate }) {
  const [q, setQ] = useState("");
  const filtered = customers.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Who's this quote for?</h2>
      <p style={{ fontSize: 13, color: P.textSecondary, margin: "0 0 16px" }}>Pick an existing customer, or add a new one from the Customers page.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
        <Search size={15} color={P.textMuted} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13.5 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <button onClick={() => onNavigate("customers")} style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: `1px dashed ${P.border}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", color: P.textMuted }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", border: `1px dashed ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Plus size={15} /></div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>New customer</span>
        </button>
        {filtered.map((c, i) => {
          const active = customer?.id === c.id;
          return (
            <button key={c.id} onClick={() => setCustomer(c)} style={{ display: "flex", alignItems: "center", gap: 10, background: active ? P.accentSoft : P.surface, border: `1px solid ${active ? P.accent : P.border}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${hue(i)}22`, color: hue(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: P.textMuted }}>{c.phone || c.email || "—"}</div>
              </div>
              {active && <Check size={16} color={P.accent} style={{ marginLeft: "auto" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------- step 2: vehicles (multi-select) ---------------------------------- */

function StepVehicles({ customer, vehiclesAll, vehicles, toggleVehicle, businessId, onVehicleAdded }) {
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("Car");
  const [newSize, setNewSize] = useState("car");
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState("");

  const options = customer ? vehiclesAll.filter((v) => v.customer_id === customer.id) : [];

  async function handleAddVehicle(e) {
    e.preventDefault();
    if (!newLabel.trim()) { setVehicleError('Enter a description, like "2021 VW ID4".'); return; }
    setSavingVehicle(true);
    setVehicleError("");
    const { data, error: insertError } = await supabase
      .from("vehicles")
      .insert({ business_id: businessId, label: newLabel.trim(), vehicle_type: newType, size_class: newSize, customer_id: customer?.id || null })
      .select()
      .single();
    setSavingVehicle(false);
    if (insertError) { setVehicleError(insertError.message); return; }
    onVehicleAdded(data);
    setAddingVehicle(false);
    setNewLabel(""); setNewType("Car"); setNewSize("car");
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Which vehicle(s)?</h2>
      <p style={{ fontSize: 13, color: P.textSecondary, margin: "0 0 16px" }}>
        {customer ? `${customer.name}'s vehicles — select as many as this quote covers.` : "Select a customer first"}
      </p>
      {addingVehicle ? (
        <div style={{ border: `1px solid ${P.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
          {vehicleError && <div style={{ fontSize: 12, color: P.danger }}>{vehicleError}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Description</label>
            <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="2021 VW ID4" style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none" }}>
                {["Car", "Motorcycle", "Boat", "RV & Trailer", "Aircraft", "Other"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Size class</label>
              <select value={newSize} onChange={(e) => setNewSize(e.target.value)} style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none" }}>
                <option value="car">Car</option>
                <option value="suv_truck_van">SUV / Truck / Van</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => { setAddingVehicle(false); setVehicleError(""); }} style={{ flex: 1, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={handleAddVehicle} disabled={savingVehicle} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 700, cursor: savingVehicle ? "default" : "pointer" }}>
              {savingVehicle ? <Loader2 size={13} className="animate-spin" /> : "Save vehicle"}
            </button>
          </div>
        </div>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <button onClick={() => setAddingVehicle(true)} disabled={!customer} title={customer ? "" : "Select a customer first"} style={{ display: "flex", alignItems: "center", gap: 10, background: "transparent", border: `1px dashed ${P.border}`, borderRadius: 12, padding: "13px 14px", cursor: customer ? "pointer" : "default", color: P.textMuted, opacity: customer ? 1 : 0.5 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, border: `1px dashed ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Plus size={15} /></div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>New vehicle</span>
        </button>
        {options.map((v) => {
          const active = vehicles.some((x) => x.id === v.id);
          return (
            <button key={v.id} onClick={() => toggleVehicle(v)} style={{ display: "flex", alignItems: "center", gap: 10, background: active ? P.accentSoft : P.surface, border: `1px solid ${active ? P.accent : P.border}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${active ? P.accent : P.border}`, background: active ? P.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {active && <Check size={13} color={P.bg} />}
              </div>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: v.color_hex || P.surfaceHover, flexShrink: 0, border: `1px solid ${P.border}` }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{v.label}</div>
                <div style={{ fontSize: 11, color: P.textMuted }}>{v.vehicle_type}</div>
              </div>
            </button>
          );
        })}
      </div>
      )}
      {customer && options.length === 0 && !addingVehicle && (
        <p style={{ fontSize: 12.5, color: P.textMuted, fontStyle: "italic", marginTop: 14 }}>{customer.name} has no vehicles on file yet — add one above.</p>
      )}
      {vehicles.length > 1 && (
        <div style={{ marginTop: 14, fontSize: 12, color: P.accent, display: "flex", alignItems: "center", gap: 6 }}>
          <Sparkles size={12} /> {vehicles.length} vehicles selected — you'll choose services for each one next.
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- step 3: services per vehicle (multi-select) ---------------------------------- */

function StepServices({
  vehicles, services, addonsAll, lineItems, togglePackage,
  proposalMode, tiers, onEnableTiered, onDisableTiered,
  onAddTier, onRemoveTier, onUpdateTierName, onToggleTierPackage, onToggleTierAddon,
  taxRate,
}) {
  const canOfferTiers = vehicles.length === 1;
  const suggested = services.length ? [...services].sort((a, b) => (Number(b.price_car_low) || 0) - (Number(a.price_car_low) || 0))[0] : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Choose services</h2>
          <p style={{ fontSize: 13, color: P.textSecondary, margin: 0 }}>
            {proposalMode === "tiered" ? "Build 2–3 priced options for this vehicle." : "Pick one or more services for each vehicle — they don't have to match."}
          </p>
        </div>
      </div>

      {canOfferTiers && (
        <div style={{ display: "flex", gap: 3, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: 3, marginTop: 12, marginBottom: 16, width: "fit-content" }}>
          <button onClick={onDisableTiered} style={{ display: "flex", alignItems: "center", gap: 6, background: proposalMode === "single" ? P.accentSoft : "transparent", color: proposalMode === "single" ? P.accent : P.textSecondary, border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            One price
          </button>
          <button onClick={onEnableTiered} disabled={services.length === 0} style={{ display: "flex", alignItems: "center", gap: 6, background: proposalMode === "tiered" ? P.accentSoft : "transparent", color: proposalMode === "tiered" ? P.accent : P.textSecondary, border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: services.length === 0 ? "default" : "pointer", opacity: services.length === 0 ? 0.5 : 1 }}>
            <Layers size={13} /> Give them options
          </button>
        </div>
      )}

      {!canOfferTiers && proposalMode === "tiered" && (
        <p style={{ fontSize: 12, color: P.textMuted, margin: "0 0 16px", fontStyle: "italic" }}>Options only apply to single-vehicle quotes — this quote will send as one price across all vehicles.</p>
      )}

      {proposalMode === "tiered" && canOfferTiers ? (
        <TierBuilder
          vehicle={vehicles[0]}
          services={services}
          addonsAll={addonsAll}
          tiers={tiers}
          taxRate={taxRate}
          onAddTier={onAddTier}
          onRemoveTier={onRemoveTier}
          onUpdateTierName={onUpdateTierName}
          onTogglePackage={onToggleTierPackage}
          onToggleAddon={onToggleTierAddon}
        />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {vehicles.map((v) => {
          const selected = lineItems[v.id] || [];
          const vTotal = selected.reduce((s, id) => s + svcPrice(findService(services, id), v), 0);
          return (
            <div key={v.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: v.color_hex || P.surfaceHover, border: `1px solid ${P.border}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: P.textPrimary }}>{v.label}</span>
                </div>
                {vTotal > 0 && <span style={{ fontSize: 12.5, fontWeight: 600, color: P.accent }}>${vTotal}</span>}
              </div>
              {services.length === 0 ? (
                <p style={{ fontSize: 12.5, color: P.textMuted, fontStyle: "italic", margin: 0 }}>No services set up yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {services.map((p) => {
                    const active = selected.includes(p.id);
                    return (
                      <label key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: active ? P.accentSoft : P.surface, border: `1px solid ${active ? P.accent : P.border}`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <input type="checkbox" checked={active} onChange={() => togglePackage(v.id, p.id)} style={{ accentColor: P.accent, flexShrink: 0 }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary }}>{p.name}</span>
                              {p.id === suggested?.id && (
                                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 700, color: P.accent, background: P.accentSoft, borderRadius: 20, padding: "1px 7px" }}>
                                  <Sparkles size={8} /> Suggested
                                </span>
                              )}
                            </span>
                            <span style={{ fontSize: 11, color: P.textMuted }}>{p.category}</span>
                          </span>
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: P.textPrimary, flexShrink: 0 }}>${svcPrice(p, v)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

/* ---------------------------------- step 4: customize ---------------------------------- */

function TaxRateField({ taxRate, setTaxRate, taxEnabled }) {
  if (!taxEnabled) {
    return (
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Tax rate (%)</label>
        <div style={{ background: P.surface, border: `1px dashed ${P.border}`, borderRadius: 9, padding: "9px 12px", fontSize: 12, color: P.textMuted }}>
          Tax is turned off for this business — enable it in Settings → Taxes to charge tax.
        </div>
      </div>
    );
  }
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Tax rate (%)</label>
      <input type="number" min="0" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none" }} />
    </div>
  );
}

function StepCustomize({ addonsAll, addons, toggleAddon, discount, setDiscount, taxRate, setTaxRate, proposalMode, taxEnabled }) {
  if (proposalMode === "tiered") {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Customize</h2>
        <p style={{ fontSize: 13, color: P.textSecondary, margin: "0 0 16px" }}>Add-ons and pricing are set per option on the previous step. Tax still applies across all of them.</p>
        <div style={{ maxWidth: 260 }}>
          <TaxRateField taxRate={taxRate} setTaxRate={setTaxRate} taxEnabled={taxEnabled} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Customize</h2>
      <p style={{ fontSize: 13, color: P.textSecondary, margin: "0 0 16px" }}>These add-ons, the discount, and tax apply across the whole quote.</p>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, margin: "0 0 8px" }}>Add-on services</div>
      {addonsAll.length === 0 ? (
        <p style={{ fontSize: 12.5, color: P.textMuted, fontStyle: "italic", margin: "0 0 20px" }}>No add-ons set up yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {addonsAll.map((a) => {
            const checked = addons.includes(a.id);
            return (
              <label key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleAddon(a.id)} style={{ accentColor: P.accent }} />
                  <span style={{ fontSize: 13, color: P.textPrimary }}>{a.name}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: P.textSecondary }}>+${a.price ?? 0}</span>
              </label>
            );
          })}
        </div>
      )}

      <style>{`@media (max-width: 640px) { .customize-discount-tax-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="customize-discount-tax-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Discount ($)</label>
          <input type="number" min="0" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none" }} />
        </div>
        <TaxRateField taxRate={taxRate} setTaxRate={setTaxRate} taxEnabled={taxEnabled} />
      </div>
    </div>
  );
}

/* ---------------------------------- step 5: photos ---------------------------------- */

function StepPhotos({ photos, addPhoto, removePhoto, notes, setNotes }) {
  const fileRef = useRef(null);
  function onPick(e) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => addPhoto(reader.result);
      reader.readAsDataURL(file);
    });
  }
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Photos & condition notes</h2>
      <p style={{ fontSize: 13, color: P.textSecondary, margin: "0 0 16px" }}>Optional, and only visible during this session — they aren't saved with the quote yet.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 10, marginBottom: 16 }}>
        <button onClick={() => fileRef.current?.click()} style={{ aspectRatio: "1", border: `1px dashed ${P.border}`, borderRadius: 10, background: "transparent", color: P.textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}>
          <ImageIcon size={18} /> <span style={{ fontSize: 10.5 }}>Add photo</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />
        {photos.map((src, i) => (
          <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: `1px solid ${P.border}` }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={() => removePhoto(i)} style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Damage / condition notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="e.g. Small scuff on rear bumper, noted before service…" style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 12px", color: P.textPrimary, fontSize: 13.5, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
    </div>
  );
}

/* ---------------------------------- step 6: review ---------------------------------- */

function StepReview({
  customer, vehicles, services, addonsAll, lineItems, addons, discount, taxRate, totals,
  description, setDescription, generateDescription, generating,
  scriptDisplay, onScriptChange, onCopyScript, scriptCopied, depositLink,
  onSaveDraft, draftSaved, savingDraft, saveError, onDownloadPdf, onPreview,
  proposalMode, tiers, quoteId,
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Review quote</h2>
          <p style={{ fontSize: 13, color: P.textSecondary, margin: 0 }}>This is what {customer?.name?.split(" ")[0] || "the customer"} will see.</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onPreview} style={{ display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            <Eye size={12} /> Preview
          </button>
          <button onClick={onSaveDraft} disabled={savingDraft} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: draftSaved ? P.accent : P.textSecondary, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, cursor: savingDraft ? "default" : "pointer", whiteSpace: "nowrap" }}>
            {savingDraft ? <Loader2 size={12} className="animate-spin" /> : draftSaved ? <Check size={12} /> : <Save size={12} />} {savingDraft ? "Saving…" : draftSaved ? "Saved" : "Save draft"}
          </button>
          <button onClick={onDownloadPdf} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
            <Download size={12} /> PDF
          </button>
        </div>
      </div>

      {saveError && <p style={{ fontSize: 12.5, color: P.danger, margin: "10px 0 0" }}>{saveError}</p>}

      <Card style={{ padding: "18px 20px", marginTop: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: P.textPrimary }}>{customer?.name}</div>
            <div style={{ fontSize: 12, color: P.textMuted }}>{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: P.textMuted }}>Quote #{shortId(quoteId)}</div>
            <div style={{ fontSize: 11, color: P.textMuted }}>Valid 14 days</div>
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${P.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>AI-written description</span>
            <button onClick={generateDescription} disabled={generating} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: P.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {description ? "Regenerate" : "Generate"}
            </button>
          </div>
          {description ? (
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, padding: "8px 10px", color: P.textSecondary, fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          ) : (
            <p style={{ fontSize: 12.5, color: P.textMuted, fontStyle: "italic", margin: 0 }}>Not generated yet — click Generate for a ready-to-send summary.</p>
          )}
        </div>

        {proposalMode === "tiered" ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${P.border}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              {tiers.length} options — {money(totals.rangeLow)}–{money(totals.rangeHigh)}
            </div>
            <TiersPreview tiers={tiers} vehicle={vehicles[0]} services={services} addonsAll={addonsAll} taxRate={taxRate} />
          </div>
        ) : (
          <>
            {/* per-vehicle line items */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${P.border}`, display: "flex", flexDirection: "column", gap: 14 }}>
              {vehicles.map((v) => {
                const ids = lineItems[v.id] || [];
                if (ids.length === 0) return null;
                return (
                  <div key={v.id}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: P.textPrimary, marginBottom: 6, display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, background: v.color_hex || P.surfaceHover, border: `1px solid ${P.border}` }} /> {v.label}
                    </div>
                    {ids.map((id) => {
                      const p = findService(services, id);
                      return (
                        <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, paddingLeft: 21 }}>
                          <span style={{ color: P.textSecondary }}>{p?.name}</span>
                          <span style={{ color: P.textPrimary, fontWeight: 600 }}>${svcPrice(p, v)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${P.border}` }}>
              {addons.map((id) => {
                const a = findAddon(addonsAll, id);
                if (!a) return null;
                return (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: P.textSecondary }}>{a.name}</span>
                    <span style={{ color: P.textPrimary, fontWeight: 600 }}>${a.price ?? 0}</span>
                  </div>
                );
              })}
              {discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: P.textSecondary }}>Discount</span>
                  <span style={{ color: P.secondary, fontWeight: 600 }}>-${discount}</span>
                </div>
              )}
              {taxRate > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: P.textSecondary }}>Tax ({taxRate}%)</span>
                  <span style={{ color: P.textPrimary, fontWeight: 600 }}>${totals.tax.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${P.border}` }}>
                <span style={{ color: P.textPrimary }}>Total</span>
                <span style={{ color: P.accent }}>{money(totals.total)}</span>
              </div>
            </div>
          </>
        )}

        {depositLink && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: P.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
            <Link2 size={12} /> Deposit link will be included when this quote is sent
          </div>
        )}
      </Card>

      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: P.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>What to say</span>
          <button onClick={onCopyScript} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: P.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
            {scriptCopied ? <Check size={12} /> : <Copy size={12} />} {scriptCopied ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea
          value={scriptDisplay}
          onChange={(e) => onScriptChange(e.target.value)}
          rows={3}
          style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 8, padding: "8px 10px", color: P.textSecondary, fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
        />
        <p style={{ fontSize: 10.5, color: P.textMuted, margin: "8px 0 0" }}>Edited here for just this quote. The reusable starting template lives in Quote settings.</p>
      </Card>
    </div>
  );
}

/* ---------------------------------- step 7: send ---------------------------------- */

function StepSend({ channels, toggleChannel, sent, customer, depositLink, onAddToCalendar, onSaveContact, onDownloadPdf, onPreview, proposalMode, tierCount }) {
  if (sent) {
    return (
      <div style={{ textAlign: "center", padding: "36px 0" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Check size={24} color={P.accent} />
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 700, color: P.textPrimary, margin: "0 0 8px" }}>Quote saved for {customer?.name}</h2>
        <p style={{ fontSize: 13, color: P.textSecondary, maxWidth: 340, margin: "0 auto" }}>
          {proposalMode === "tiered"
            ? `It's marked Sent with all ${tierCount} options, ready to view from Saved quotes.`
            : "It's marked Sent and saved to Saved quotes, ready to share with the customer."}
        </p>
        {depositLink && (
          <p style={{ fontSize: 12, color: P.accent, maxWidth: 340, margin: "10px auto 0" }}>A deposit link was included so they can lock in a time right away.</p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 22 }}>
          <button onClick={onAddToCalendar} style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <CalendarPlus size={14} /> Add follow-up to calendar
          </button>
          <button onClick={onSaveContact} style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <UserPlus size={14} /> Save contact
          </button>
          <button onClick={onDownloadPdf} style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Download size={14} /> Download PDF
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Send it</h2>
          <p style={{ fontSize: 13, color: P.textSecondary, margin: 0 }}>Choose how {customer?.name || "the customer"} gets this quote — you'll deliver it through the channel(s) you pick below.</p>
        </div>
        <button onClick={onPreview} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          <Eye size={12} /> Preview
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {[
          { id: "email", label: "Email", Icon: Mail, sub: customer?.email },
          { id: "sms", label: "Text message", Icon: MessageSquare, sub: customer?.phone },
          { id: "pdf", label: "Download PDF", Icon: FileText, sub: "Print or share manually" },
        ].map((c) => {
          const active = channels.includes(c.id);
          return (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, background: active ? P.accentSoft : P.surface, border: `1px solid ${active ? P.accent : P.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={active} onChange={() => toggleChannel(c.id)} style={{ accentColor: P.accent }} />
              <c.Icon size={16} color={active ? P.accent : P.textMuted} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{c.label}</div>
                <div style={{ fontSize: 11.5, color: P.textMuted }}>{c.sub}</div>
              </div>
            </label>
          );
        })}
      </div>
      {depositLink && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: P.accent, marginTop: 12 }}>
          <Link2 size={12} /> Your deposit link will be attached automatically.
        </div>
      )}
      <p style={{ fontSize: 12, color: P.textMuted, marginTop: 16 }}>
        This marks the quote Sent and saves it to Saved quotes — actually delivering it through the channel(s) above is on you for now.
      </p>
    </div>
  );
}

/* ---------------------------------- saved quotes ---------------------------------- */

function SavedQuotesList({ quotes, loading, error, onView, onDelete, onDownloadPdf, onExportCSV, onNew }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: P.textPrimary, margin: "0 0 4px" }}>Saved quotes</h2>
          <p style={{ fontSize: 13, color: P.textSecondary, margin: 0 }}>Every quote you've sent or drafted, in one place.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onExportCSV} disabled={!quotes.length} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: quotes.length ? P.textSecondary : P.textMuted, borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: quotes.length ? "pointer" : "default" }}>
            <FileSpreadsheet size={14} /> Export CSV
          </button>
          <button onClick={onNew} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={14} /> New quote
          </button>
        </div>
      </div>

      {loading ? (
        <Card style={{ padding: "40px 20px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Loader2 size={15} className="animate-spin" color={P.textMuted} /> <span style={{ fontSize: 13, color: P.textMuted }}>Loading quotes…</span>
        </Card>
      ) : error ? (
        <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
      ) : quotes.length === 0 ? (
        <Card style={{ padding: "40px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: P.textMuted, margin: 0 }}>No saved quotes yet. Finish a quote or save a draft to see it here.</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {quotes.map((q, i) => (
            <Card key={q.id} style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${hue(i)}22`, color: hue(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials(q.customerName)}</div>
              <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{q.customerName}</div>
                <div style={{ fontSize: 11.5, color: P.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.vehicleSummary}</div>
              </div>
              <div style={{ fontSize: 11, color: P.textMuted, flexShrink: 0 }}>{q.createdAt}</div>
              {q.proposalMode === "tiered" && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: P.accent, background: P.accentSoft, borderRadius: 20, padding: "3px 8px", flexShrink: 0 }}>
                  <Layers size={10} /> {q.tiers.length} options
                </span>
              )}
              <StatusBadge status={q.status} />
              <div style={{ fontSize: 14, fontWeight: 700, color: P.textPrimary, flexShrink: 0, minWidth: 64, textAlign: "right" }}>
                {q.totals.isRange ? `${money(q.totals.rangeLow)}–${money(q.totals.rangeHigh)}` : money(q.totals.total)}
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => onView(q)} title="View / edit" style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 7, padding: 6, cursor: "pointer", display: "flex" }}><Eye size={13} /></button>
                <button onClick={() => onDownloadPdf(q)} title="Download PDF" style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 7, padding: 6, cursor: "pointer", display: "flex" }}><Download size={13} /></button>
                <button onClick={() => onDelete(q.id)} title="Delete" style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.danger, borderRadius: 7, padding: 6, cursor: "pointer", display: "flex" }}><Trash2 size={13} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- quote settings panel ---------------------------------- */

function BusinessPanel({ open, onClose, depositLink, setDepositLink, script, setScript }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 16, padding: 22, maxWidth: 440, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary, margin: 0 }}>Quote settings</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>Deposit link</label>
        <p style={{ fontSize: 11, color: P.textMuted, margin: "0 0 8px" }}>Stripe, Square, or PayPal — attached to every quote you send. Only saved for this browser session for now.</p>
        <input value={depositLink} onChange={(e) => setDepositLink(e.target.value)} placeholder="https://buy.stripe.com/…" style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 13, outline: "none", marginBottom: 18 }} />

        <label style={{ fontSize: 12, fontWeight: 600, color: P.textSecondary, display: "block", marginBottom: 6 }}>What-to-say script</label>
        <p style={{ fontSize: 11, color: P.textMuted, margin: "0 0 8px" }}>
          Use {"{customer_first}"}, {"{vehicle}"}, {"{price_low}"}, {"{price_high}"}, {"{service_summary}"} — they fill in automatically on the Review step.
        </p>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={5} style={{ width: "100%", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "9px 12px", color: P.textPrimary, fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />

        <button onClick={onClose} style={{ marginTop: 18, width: "100%", background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
}

/* ---------------------------------- printable PDF ---------------------------------- */

const PRINT_ACCENT = "#18D97A";

function PrintHeader({ business, docLabel, preparedDate }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {business.logoUrl ? (
            <img src={business.logoUrl} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${PRINT_ACCENT}22`, color: PRINT_ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>
              {initials(business.name || "?")}
            </div>
          )}
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>{business.name}</div>
            {business.tagline && <div style={{ fontSize: 10.5, color: "#777", marginTop: 2 }}>{business.tagline}</div>}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: PRINT_ACCENT, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{docLabel}</div>
      </div>
      <div style={{ height: 3, background: PRINT_ACCENT, borderRadius: 2, margin: "14px 0 8px" }} />
      <div style={{ fontSize: 11, color: "#555" }}>Prepared {preparedDate}</div>
    </div>
  );
}

function PrintSection({ label, children, style }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 4, height: 13, borderRadius: 2, background: PRINT_ACCENT, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#555" }}>{label}</span>
      </div>
      <div style={{ background: "#f4f4f4", borderRadius: 10, padding: "13px 15px" }}>
        {children}
      </div>
    </div>
  );
}

// A one-line summary of what's in a tier, generated from its real selected
// items — same templated-from-real-data spirit as generateDescription(),
// just synchronous since there's no "thinking" delay to simulate here.
function tierDescription(tier, services, addonsAll) {
  const names = [
    ...tier.packageIds.map((id) => findService(services, id)?.name),
    ...tier.addonIds.map((id) => findAddon(addonsAll, id)?.name),
  ].filter(Boolean);
  return names.length ? `Includes ${names.join(", ")}.` : "No items selected yet.";
}

function closingNote(proposalMode) {
  return proposalMode === "tiered"
    ? "Let me know which option works best for you!"
    : "Let me know if you have any questions — happy to get this on the schedule!";
}

function PrintableQuote({ q, services, addonsAll, business, id = "atlas-print-root" }) {
  if (!q) return null;
  const vehicle = q.vehicles[0];
  const tiered = q.proposalMode === "tiered";

  return (
    <div id={id}>
      <PrintHeader business={business} docLabel={business.quoteLabel || "SERVICE QUOTE"} preparedDate={q.createdAt} />

      <PrintSection label="Prepared For">
        <div style={{ fontWeight: 700, fontSize: 13 }}>{q.customer?.name}</div>
        {q.vehicleSummary && q.vehicleSummary !== "—" && <div style={{ fontSize: 12, color: "#444", marginTop: 3 }}>{q.vehicleSummary}</div>}
        {q.customer?.phone && <div style={{ fontSize: 12, color: "#444", marginTop: 3 }}>{q.customer.phone}</div>}
        {q.customer?.email && <div style={{ fontSize: 12, color: "#444", marginTop: 3 }}>{q.customer.email}</div>}
      </PrintSection>

      {q.notes && (
        <PrintSection label="Job Details">
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#777", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>Condition</div>
          <div style={{ fontSize: 12, color: "#333", lineHeight: 1.5 }}>{q.notes}</div>
        </PrintSection>
      )}

      <PrintSection label="What's Included">
        {tiered ? (
          q.tiers.map((tier, i) => {
            const { total } = tierTotalWithTax(tier, vehicle, services, addonsAll, q.taxRate);
            const names = [
              ...tier.packageIds.map((id) => findService(services, id)?.name),
              ...tier.addonIds.map((id) => findAddon(addonsAll, id)?.name),
            ].filter(Boolean);
            return (
              <div key={tier.id} style={{ marginBottom: i < q.tiers.length - 1 ? 14 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                  <span>{tier.name}</span><span>{money(total)}</span>
                </div>
                <p style={{ margin: "3px 0 6px", fontSize: 11.5, color: "#555" }}>{tierDescription(tier, services, addonsAll)}</p>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {names.map((n, j) => <li key={j} style={{ fontSize: 12, color: "#333" }}>{n}</li>)}
                </ul>
              </div>
            );
          })
        ) : (
          <>
            {q.vehicles.map((v) => {
              const ids = q.lineItems[v.id] || [];
              if (!ids.length) return null;
              return (
                <div key={v.id} style={{ marginBottom: 12 }}>
                  {q.vehicles.length > 1 && <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{v.label}</div>}
                  {ids.map((id) => {
                    const p = findService(services, id);
                    return (
                      <div key={id} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                          <span style={{ fontWeight: 600 }}>{p?.name}</span><span style={{ fontWeight: 600 }}>${svcPrice(p, v)}</span>
                        </div>
                        {p?.description && (
                          <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "#777", lineHeight: 1.5 }}>{p.description}</p>
                        )}
                        {p?.includes?.length > 0 && (
                          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                            {p.includes.map((line, k) => <li key={k} style={{ fontSize: 10.5, color: "#777", lineHeight: 1.5 }}>{line}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {(q.addons || []).length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
                {q.addons.map((id) => {
                  const a = findAddon(addonsAll, id);
                  if (!a) return null;
                  return (
                    <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span>{a.name}</span><span>${a.price ?? 0}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PrintSection>

      {tiered ? (
        <PrintSection label="Choose One Of These Options">
          {q.tiers.map((tier) => {
            const { total } = tierTotalWithTax(tier, vehicle, services, addonsAll, q.taxRate);
            return (
              <div key={tier.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
                <span>{tier.name}</span><span style={{ fontWeight: 700 }}>{money(total)}</span>
              </div>
            );
          })}
        </PrintSection>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span>Subtotal</span><span>${q.totals.subtotal.toFixed(2)}</span>
          </div>
          {q.discount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span>Discount</span><span>-${q.discount}</span>
            </div>
          )}
          {q.taxRate > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span>Tax ({q.taxRate}%)</span><span>${q.totals.tax.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginTop: 10, paddingTop: 10, borderTop: `2px solid ${PRINT_ACCENT}` }}>
            <span>Total</span><span>${q.totals.total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {business.depositLink && (
        <div style={{ marginBottom: 16, fontSize: 11, color: "#555" }}>
          Secure your spot — pay your deposit: {business.depositLink}
        </div>
      )}

      {q.photos && q.photos.length > 0 && (
        <PrintSection label="Photos">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {q.photos.map((src, i) => (
              <img key={i} src={src} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, border: "1px solid #ccc" }} />
            ))}
          </div>
        </PrintSection>
      )}

      <PrintSection label="Notes">
        {q.description && <p style={{ margin: "0 0 8px", fontSize: 12, lineHeight: 1.6 }}>{q.description}</p>}
        <p style={{ margin: 0, fontSize: 12, fontStyle: "italic" }}>{closingNote(q.proposalMode)}</p>
      </PrintSection>
    </div>
  );
}

// Shows the exact PrintableQuote document on-screen — what the customer
// will actually see — instead of the app-themed Review card, so there's a
// real preview before Send rather than just this app's own summary.
function QuotePreviewModal({ onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#111", borderRadius: 12, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: "32px 36px", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#333" }}>
          <X size={15} />
        </button>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasQuickQuotePro({ onNavigate, currentPage = "quote" }) {
  const { businessId, businessName, businessLogoUrl, businessTagline, businessQuoteLabel, businessDefaultTaxRate, businessTaxEnabled, loading: bizLoading, error: bizError } = useBusinessId();
  const [customersAll, setCustomersAll] = useState([]);
  const [vehiclesAll, setVehiclesAll] = useState([]);
  const [services, setServices] = useState([]);
  const [addonsAll, setAddonsAll] = useState([]);
  const [savedQuotes, setSavedQuotes] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  const [view, setView] = useState("new"); // "new" | "saved"
  const [step, setStep] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  const [currentQuoteId, setCurrentQuoteId] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [lineItems, setLineItems] = useState({}); // { [vehicleId]: [serviceId, ...] }
  const [proposalMode, setProposalMode] = useState("single"); // "single" | "tiered"
  const [tiers, setTiers] = useState([]);
  const [addons, setAddons] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(7);
  useEffect(() => {
    if (!bizLoading && currentQuoteId === null) setTaxRate(businessTaxEnabled ? businessDefaultTaxRate : 0);
  }, [bizLoading, businessTaxEnabled, businessDefaultTaxRate, currentQuoteId]);
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [channels, setChannels] = useState(["email"]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [saveError, setSaveError] = useState("");

  const [draftSaved, setDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [depositLink, setDepositLink] = useState("");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [showBusinessPanel, setShowBusinessPanel] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  // Per-quote override of the "What to say" text, so it's directly editable
  // on the Review step without changing the reusable template in Quote
  // settings. Null means "just show the template filled in for this quote."
  const [scriptOverride, setScriptOverride] = useState(null);
  const [printQuote, setPrintQuote] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function load() {
      setLoadingData(true);
      const [customersRes, vehiclesRes, servicesRes, addonsRes, quotesRes] = await Promise.all([
        supabase.from("customers").select("id, name, email, phone").eq("business_id", businessId).order("name", { ascending: true }),
        supabase.from("vehicles").select("id, label, customer_id, color_hex, vehicle_type, size_class").eq("business_id", businessId).order("label", { ascending: true }),
        supabase.from("services").select("id, name, category, price_car_low, price_suv_low, includes").eq("business_id", businessId).order("sort_order", { ascending: true }),
        supabase.from("addons").select("id, name, price").eq("business_id", businessId).order("name", { ascending: true }),
        supabase.from("quotes").select("*, customers(name, email, phone)").eq("business_id", businessId).order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const vById = Object.fromEntries((vehiclesRes.data || []).map((v) => [v.id, v]));
      const firstError = customersRes.error || vehiclesRes.error || servicesRes.error || addonsRes.error || quotesRes.error;
      if (firstError) {
        setDataError(firstError.message);
      } else {
        setCustomersAll(customersRes.data);
        setVehiclesAll(vehiclesRes.data);
        setServices(servicesRes.data);
        setAddonsAll(addonsRes.data);
        setSavedQuotes(quotesRes.data.map((row) => hydrateQuote(row, vById)));
      }
      setLoadingData(false);
    }

    load();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && loadingData);
  const error = bizError || dataError;
  const vehiclesById = useMemo(() => Object.fromEntries(vehiclesAll.map((v) => [v.id, v])), [vehiclesAll]);

  function selectCustomer(c) {
    setCustomer(c);
    setVehicles([]);
    setLineItems({});
    setProposalMode("single");
    setTiers([]);
  }
  function toggleVehicle(v) {
    setVehicles((prev) => {
      const exists = prev.some((x) => x.id === v.id);
      const next = exists ? prev.filter((x) => x.id !== v.id) : [...prev, v];
      if (exists) {
        setLineItems((li) => { const n = { ...li }; delete n[v.id]; return n; });
      }
      // Tiered options only make sense for a single vehicle — fall back automatically otherwise.
      if (next.length !== 1 && proposalMode === "tiered") {
        setProposalMode("single");
        setTiers([]);
      }
      return next;
    });
  }
  function handleVehicleAddedInQuote(vehicle) {
    setVehiclesAll((vs) => [...vs, vehicle]);
    toggleVehicle(vehicle);
  }
  function togglePackage(vehicleId, pkgId) {
    setLineItems((li) => {
      const current = li[vehicleId] || [];
      const next = current.includes(pkgId) ? current.filter((id) => id !== pkgId) : [...current, pkgId];
      return { ...li, [vehicleId]: next };
    });
  }
  function toggleAddon(id) { setAddons((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])); }
  function toggleChannel(id) { setChannels((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); }
  function addPhoto(src) { setPhotos((p) => [...p, src]); }
  function removePhoto(i) { setPhotos((p) => p.filter((_, idx) => idx !== i)); }

  function enableTiered() {
    if (services.length === 0) return;
    setProposalMode("tiered");
    setTiers(suggestTiers(services, vehicles[0]));
  }
  function disableTiered() {
    setProposalMode("single");
    setTiers([]);
  }
  function addTier() {
    setTiers((t) => (t.length >= 3 ? t : [...t, { id: `tier-${Date.now()}`, name: TIER_NAMES[t.length] || `Option ${t.length + 1}`, packageIds: [], addonIds: [] }]));
  }
  function removeTier(id) { setTiers((t) => t.filter((x) => x.id !== id)); }
  function updateTierName(id, name) { setTiers((t) => t.map((x) => (x.id === id ? { ...x, name } : x))); }
  function toggleTierPackage(id, pkgId) {
    setTiers((t) => t.map((x) => (x.id === id ? { ...x, packageIds: x.packageIds.includes(pkgId) ? x.packageIds.filter((p) => p !== pkgId) : [...x.packageIds, pkgId] } : x)));
  }
  function toggleTierAddon(id, addonId) {
    setTiers((t) => t.map((x) => (x.id === id ? { ...x, addonIds: x.addonIds.includes(addonId) ? x.addonIds.filter((a) => a !== addonId) : [...x.addonIds, addonId] } : x)));
  }

  const totals = useMemo(() => {
    if (proposalMode === "tiered") {
      const vehicle = vehicles[0];
      const computed = tiers.map((t) => ({ ...t, ...tierTotalWithTax(t, vehicle, services, addonsAll, taxRate) }));
      const values = computed.map((t) => t.total);
      const rangeLow = values.length ? Math.min(...values) : 0;
      const rangeHigh = values.length ? Math.max(...values) : 0;
      return { subtotal: rangeLow, tax: 0, total: rangeLow, rangeLow, rangeHigh, isRange: true };
    }
    const servicesTotal = Object.entries(lineItems).reduce((s, [vehicleId, ids]) => {
      const v = vehiclesById[vehicleId] || vehicles.find((x) => x.id === vehicleId);
      return s + ids.reduce((s2, id) => s2 + svcPrice(findService(services, id), v), 0);
    }, 0);
    const addonTotal = addons.reduce((s, id) => s + (Number(findAddon(addonsAll, id)?.price) || 0), 0);
    const subtotal = servicesTotal + addonTotal - discount;
    const tax = Math.max(0, subtotal) * (taxRate / 100);
    return { subtotal, tax, total: Math.max(0, subtotal) + tax, isRange: false };
  }, [lineItems, addons, discount, taxRate, proposalMode, tiers, vehicles, services, addonsAll, vehiclesById]);

  function generateDescription() {
    setGenerating(true);
    setTimeout(() => {
      const vehicleSummaries = vehicles
        .filter((v) => (lineItems[v.id] || []).length > 0)
        .map((v) => {
          const names = (lineItems[v.id] || []).map((id) => findService(services, id)?.name).filter(Boolean);
          return `${v.label} (${names.join(" + ")})`;
        });
      const addonNames = addons.map((id) => findAddon(addonsAll, id)?.name).filter(Boolean);
      const extra = addonNames.length ? ` We've also included ${addonNames.join(", ")} to keep everything looking its best.` : "";
      setDescription(
        `Thanks for choosing ${businessName || "us"}! This quote covers ${vehicleSummaries.join("; ")}, restoring that just-detailed shine inside and out.${extra} We look forward to taking care of it.`
      );
      setGenerating(false);
    }, 900);
  }

  // "What to say" script, filled in live from the current quote
  const scriptContext = useMemo(() => {
    const customerFirst = customer?.name?.split(" ")[0] || "there";
    const vehicle = vehicles.length === 1 ? vehicles[0].label : vehicles.length > 1 ? `${vehicles.length} vehicles` : "your vehicle";
    if (proposalMode === "tiered") {
      const serviceSummary = tiers.length ? `${tiers.length} options — ${tiers.map((t) => t.name).join(", ")}` : "a few options";
      return { customerFirst, vehicle, serviceSummary, priceLow: totals.rangeLow || null, priceHigh: totals.rangeHigh || null };
    }
    const serviceNames = [...new Set(Object.values(lineItems).flat().map((id) => findService(services, id)?.name).filter(Boolean))];
    const serviceSummary = serviceNames.length ? serviceNames.join(", ") : "your service";
    const priceLow = totals.total > 0 ? Math.round(totals.total * 0.9) : null;
    const priceHigh = totals.total > 0 ? Math.round(totals.total * 1.1) : null;
    return { customerFirst, vehicle, serviceSummary, priceLow, priceHigh };
  }, [customer, vehicles, lineItems, totals, proposalMode, tiers, services]);

  const scriptPreview = useMemo(() => fillScript(script, scriptContext), [script, scriptContext]);
  const scriptDisplay = scriptOverride ?? scriptPreview;

  function copyScript() {
    navigator.clipboard?.writeText(scriptDisplay).catch(() => {});
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 1500);
  }

  function buildPayload(status) {
    return {
      business_id: businessId,
      customer_id: customer?.id || null,
      status,
      proposal_mode: proposalMode,
      line_items: { vehicleIds: vehicles.map((v) => v.id), addonIds: addons, byVehicle: lineItems },
      tiers,
      discount,
      tax_rate: taxRate,
      totals,
      description: description || null,
    };
  }

  async function persistQuote(status) {
    const payload = buildPayload(status);
    const query = currentQuoteId
      ? supabase.from("quotes").update(payload).eq("id", currentQuoteId)
      : supabase.from("quotes").insert(payload);
    const { data, error: saveErr } = await query.select("*, customers(name, email, phone)").single();
    if (saveErr) return { error: saveErr };
    const hydrated = hydrateQuote(data, vehiclesById);
    setCurrentQuoteId(hydrated.id);
    setSavedQuotes((qs) => {
      const exists = qs.some((q) => q.id === hydrated.id);
      return exists ? qs.map((q) => (q.id === hydrated.id ? hydrated : q)) : [hydrated, ...qs];
    });
    return { data: hydrated };
  }

  async function saveDraft() {
    setSavingDraft(true);
    setSaveError("");
    const { error: saveErr } = await persistQuote("draft");
    setSavingDraft(false);
    if (saveErr) { setSaveError(saveErr.message); return; }
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 1600);
  }

  function openQuote(q) {
    setCurrentQuoteId(q.id);
    setCustomer(q.customer);
    setVehicles(q.vehicles);
    setProposalMode(q.proposalMode || "single");
    setLineItems(q.lineItems || {});
    setTiers(q.tiers || []);
    setAddons(q.addons);
    setDiscount(q.discount);
    setTaxRate(q.taxRate);
    setDescription(q.description);
    setScriptOverride(null);
    // Always reopen editable, even if it was already sent — `sent` only
    // means "just showed the post-send confirmation screen this session";
    // it isn't the quote's persisted status, and leaving it true here hid
    // NavButtons entirely, making a previously-sent quote unnavigable.
    setSent(false);
    setSaveError("");
    setStep(5);
    setView("new");
  }

  async function deleteQuote(id) {
    const previous = savedQuotes;
    setSavedQuotes((qs) => qs.filter((q) => q.id !== id));
    const { error: deleteErr } = await supabase.from("quotes").delete().eq("id", id);
    if (deleteErr) setSavedQuotes(previous);
  }

  function resetQuote() {
    setCurrentQuoteId(null);
    setStep(0); setCustomer(null); setVehicles([]); setProposalMode("single"); setLineItems({}); setTiers([]); setAddons([]);
    setDiscount(0); setTaxRate(businessTaxEnabled ? businessDefaultTaxRate : 0); setPhotos([]); setNotes(""); setDescription("");
    setChannels(["email"]); setSent(false); setLastSent(null); setSaveError(""); setScriptOverride(null);
  }

  function triggerPrint(snapshot) {
    if (snapshot) setPrintQuote(snapshot);
  }

  // A preview snapshot for the Review step's "PDF" button, built from
  // in-progress local state without writing anything to the database.
  function buildLocalSnapshot() {
    return {
      ...hydrateQuote(
        { ...buildPayload("draft"), id: currentQuoteId, created_at: new Date().toISOString(), customers: customer },
        vehiclesById
      ),
      photos,
      notes,
    };
  }

  useEffect(() => {
    if (!printQuote) return;
    const handleAfterPrint = () => setPrintQuote(null);
    window.addEventListener("afterprint", handleAfterPrint);
    // See the matching comment in AtlasInvoices.tsx — calling this directly
    // instead of behind an extra setTimeout hop keeps it as close as
    // possible to the click that triggered it, which matters for browsers'
    // print/dialog-throttling heuristics.
    printWhenReady();
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printQuote]);

  function addToCalendar() {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const ics = buildICS({
      title: `Follow up: ${customer?.name || "Customer"} — ${vehicles.map((v) => v.label).join(", ") || "quote"}`,
      notes: description || "Follow up on Atlas quote.",
      start,
    });
    downloadText(`follow-up-${(customer?.name || "customer").replace(/\s+/g, "-").toLowerCase()}.ics`, ics, "text/calendar");
  }

  function saveContact() {
    if (!customer) return;
    downloadText(`${customer.name.replace(/\s+/g, "-").toLowerCase()}.vcf`, buildVCard(customer), "text/vcard");
  }

  async function handleSend() {
    setSending(true);
    setSaveError("");
    const { data, error: sendErr } = await persistQuote("sent");
    setSending(false);
    if (sendErr) { setSaveError(sendErr.message); return; }
    setSent(true);
    setLastSent({ ...data, photos, notes });
  }

  const allVehiclesHaveService = vehicles.length > 0 && vehicles.every((v) => (lineItems[v.id] || []).length > 0);
  const tiersReady = proposalMode === "tiered" && tiers.length >= 2 && tiers.every((t) => t.packageIds.length > 0);
  const servicesStepReady = proposalMode === "tiered" ? tiersReady : allVehiclesHaveService;

  const canNext = [
    !!customer,
    vehicles.length > 0,
    servicesStepReady,
    true,
    true,
    true,
  ][step];

  // While a print/PDF is in flight, render ONLY the printable document --
  // nothing else in the DOM for the browser's print engine to deal with.
  // This sidesteps iOS Safari's well-known blank-page bug with the
  // "hide everything else via CSS" trick, which doesn't reliably apply
  // print styles to a page this complex before generating the preview.
  if (printQuote) {
    return (
      <div style={{ background: "#fff", color: "#111", minHeight: "100vh", padding: 40 }}>
        <PrintableQuote q={printQuote} services={services} addonsAll={addonsAll} business={{ name: businessName || "Your Business", logoUrl: businessLogoUrl, tagline: businessTagline, quoteLabel: businessQuoteLabel, depositLink }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>

      {/* SIDEBAR */}
      <div className="hidden lg:flex" style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${P.border}`, flexDirection: "column", padding: "22px 14px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 28 }}>
          <AtlasMark size={24} /><span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Atlas</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((item) => <NavItem key={item.id} item={item} active={currentPage === item.id} onClick={() => onNavigate(item.id)} />)}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: `1px solid ${P.border}`, paddingTop: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: P.accent }}>{!businessLogoUrl && initials(businessName || "Detail Hero")}</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>{businessName || "Detail Hero"}</div><div style={{ fontSize: 11, color: P.textMuted }}>Owner</div></div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 88 }}>
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
            <BrandLockup size={30} businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: P.textPrimary, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}><Sparkles size={13} color={P.accent} /> Atlas QuickQuote</div>
              {view === "new" && totals.total > 0 && (
                <div style={{ fontSize: 12, color: P.accent, fontWeight: 600 }}>
                  {totals.isRange ? `${money(totals.rangeLow)}–${money(totals.rangeHigh)} · ${tiers.length} options` : `${money(totals.total)} · ${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""}`}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: view === "new" ? 12 : 0 }}>
            <div style={{ display: "flex", gap: 3, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: 3 }}>
              <button onClick={() => setView("new")} style={{ background: view === "new" ? P.accentSoft : "transparent", color: view === "new" ? P.accent : P.textSecondary, border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>New quote</button>
              <button onClick={() => setView("saved")} style={{ background: view === "saved" ? P.accentSoft : "transparent", color: view === "saved" ? P.accent : P.textSecondary, border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Saved ({savedQuotes.length})</button>
            </div>
            <button onClick={() => setShowBusinessPanel(true)} title="Deposit link & sales script" style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "7px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <Settings2 size={13} /> Quote settings
            </button>
          </div>

          {view === "new" && <Stepper step={step} />}
        </div>

        <div style={{ padding: "22px 24px", maxWidth: view === "saved" ? 760 : 640 }}>
          {view === "saved" ? (
            <SavedQuotesList
              quotes={savedQuotes}
              loading={loading}
              error={error}
              onView={openQuote}
              onDelete={deleteQuote}
              onDownloadPdf={(q) => triggerPrint(q)}
              onExportCSV={() => downloadText(`atlas-quotes-${Date.now()}.csv`, quotesToCSV(savedQuotes), "text/csv")}
              onNew={() => { resetQuote(); setView("new"); }}
            />
          ) : loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: P.textMuted, fontSize: 13 }}>
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : (
            <>
              {step === 0 && <StepCustomer customers={customersAll} customer={customer} setCustomer={selectCustomer} onNavigate={onNavigate} />}
              {step === 1 && <StepVehicles customer={customer} vehiclesAll={vehiclesAll} vehicles={vehicles} toggleVehicle={toggleVehicle} businessId={businessId} onVehicleAdded={handleVehicleAddedInQuote} />}
              {step === 2 && (
                <StepServices
                  vehicles={vehicles} services={services} addonsAll={addonsAll} lineItems={lineItems} togglePackage={togglePackage}
                  proposalMode={proposalMode} tiers={tiers} taxRate={taxRate}
                  onEnableTiered={enableTiered} onDisableTiered={disableTiered}
                  onAddTier={addTier} onRemoveTier={removeTier} onUpdateTierName={updateTierName}
                  onToggleTierPackage={toggleTierPackage} onToggleTierAddon={toggleTierAddon}
                />
              )}
              {step === 3 && <StepCustomize addonsAll={addonsAll} addons={addons} toggleAddon={toggleAddon} discount={discount} setDiscount={setDiscount} taxRate={taxRate} setTaxRate={setTaxRate} proposalMode={proposalMode} taxEnabled={businessTaxEnabled} />}
              {step === 4 && <StepPhotos photos={photos} addPhoto={addPhoto} removePhoto={removePhoto} notes={notes} setNotes={setNotes} />}
              {step === 5 && (
                <StepReview
                  customer={customer} vehicles={vehicles} services={services} addonsAll={addonsAll} lineItems={lineItems} addons={addons}
                  discount={discount} taxRate={taxRate} totals={totals}
                  proposalMode={proposalMode} tiers={tiers} quoteId={currentQuoteId}
                  description={description} setDescription={setDescription}
                  generateDescription={generateDescription} generating={generating}
                  scriptDisplay={scriptDisplay} onScriptChange={setScriptOverride} onCopyScript={copyScript} scriptCopied={scriptCopied}
                  depositLink={depositLink}
                  onSaveDraft={saveDraft} draftSaved={draftSaved} savingDraft={savingDraft} saveError={saveError}
                  onDownloadPdf={() => triggerPrint(buildLocalSnapshot())}
                  onPreview={() => setPreviewOpen(true)}
                />
              )}
              {step === 6 && (
                <StepSend
                  channels={channels} toggleChannel={toggleChannel} sent={sent} customer={customer}
                  depositLink={depositLink}
                  proposalMode={proposalMode} tierCount={tiers.length}
                  onAddToCalendar={addToCalendar} onSaveContact={saveContact}
                  onDownloadPdf={() => triggerPrint(lastSent)}
                  onPreview={() => setPreviewOpen(true)}
                />
              )}

              {!sent && <NavButtons step={step} setStep={setStep} canNext={canNext} onSend={handleSend} sending={sending} />}
            </>
          )}
        </div>
      </div>

      <div className="flex lg:hidden" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: P.bgTop, borderTop: `1px solid ${P.border}`, padding: "10px 6px 18px", justifyContent: "space-around", zIndex: 20 }}>
        {MOBILE_NAV.map((item) => {
          const isActive = item.id === "more" ? moreOpen : currentPage === item.id;
          return (
            <button key={item.id} onClick={() => (item.id === "more" ? setMoreOpen((v) => !v) : onNavigate(item.id))} style={{ background: "transparent", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", color: isActive ? P.accent : P.textMuted }}>
              <item.Icon size={19} /><span style={{ fontSize: 10.5, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
            </button>
          );
        })}
      </div>
      {moreOpen && (
        <>
          <div className="flex lg:hidden" onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 21 }} />
          <div className="flex lg:hidden" style={{ position: "fixed", bottom: 84, left: 12, right: 12, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: 8, zIndex: 22, flexDirection: "column", gap: 2 }}>
            {MORE_PAGES.map((p) => (
              <button key={p.id} onClick={() => { onNavigate(p.id); setMoreOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 9, border: "none", background: currentPage === p.id ? P.surfaceHover : "transparent", color: currentPage === p.id ? P.textPrimary : P.textSecondary, cursor: "pointer", textAlign: "left" }}>
                <p.Icon size={16} color={currentPage === p.id ? P.accent : P.textMuted} />
                <span style={{ fontSize: 13.5, fontWeight: currentPage === p.id ? 600 : 500 }}>{p.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <BusinessPanel open={showBusinessPanel} onClose={() => setShowBusinessPanel(false)} depositLink={depositLink} setDepositLink={setDepositLink} script={script} setScript={setScript} />
      {previewOpen && (
        <QuotePreviewModal onClose={() => setPreviewOpen(false)}>
          <PrintableQuote
            id="atlas-quote-preview-root"
            q={sent ? lastSent : buildLocalSnapshot()}
            services={services}
            addonsAll={addonsAll}
            business={{ name: businessName || "Your Business", logoUrl: businessLogoUrl, tagline: businessTagline, quoteLabel: businessQuoteLabel, depositLink }}
          />
        </QuotePreviewModal>
      )}
    </div>
  );
}
