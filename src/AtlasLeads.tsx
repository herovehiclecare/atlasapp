import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Plus, Sparkles, MoreHorizontal,
  X, Loader2, ListChecks, Inbox as LeadsIcon, Camera,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { useLiveClock, formatDateTime, callHref, textHref, resizeImageToDataUrl } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", danger: "#FF6B5E", warn: "#F5B942", blue: "#5BB8FF",
};
const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};

const NAV = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid }, { id: "leads", label: "Leads", Icon: LeadsIcon },
  { id: "customers", label: "Customers", Icon: Users },
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "schedule", label: "Schedule", Icon: Calendar }, { id: "followups", label: "Follow-ups", Icon: ListChecks },
  { id: "invoices", label: "Invoices", Icon: Receipt }, { id: "settings", label: "Settings", Icon: Settings },
];
const MOBILE_NAV = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid }, { id: "schedule", label: "Schedule", Icon: Calendar },
  { id: "leads", label: "Leads", Icon: LeadsIcon }, { id: "invoices", label: "Invoices", Icon: Receipt },
  { id: "more", label: "More", Icon: MoreHorizontal },
];
const MORE_PAGES = [
  { id: "customers", label: "Customers", Icon: Users },
  { id: "vehicles", label: "Vehicles", Icon: Car }, { id: "quote", label: "Atlas QuickQuote", Icon: Sparkles },
  { id: "followups", label: "Follow-ups", Icon: ListChecks }, { id: "settings", label: "Settings", Icon: Settings },
];

const STAGES = [
  { id: "new", label: "New", color: P.danger },
  { id: "contacted", label: "Contacted", color: P.warn },
  { id: "quoted", label: "Quoted", color: P.blue },
  { id: "booked", label: "Booked", color: P.accent },
];
const SOURCE_LABEL = { estimate_request: "Instant Quote", facebook_lead_ads: "Facebook", facebook_messenger: "Messenger", manual_lead: "Manual" };
const HOUR = 3600000;

function initials(name) { return (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }
function money(n) { return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`; }
function ago(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 2) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
function estimateText(ctx) {
  if (!ctx || ctx.estimate_low == null) return "";
  const lo = Number(ctx.estimate_low) || 0;
  const hi = Number(ctx.estimate_high) || 0;
  if (ctx.open_ended) return `from ${money(lo)}`;
  return lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`;
}
function summaryLines(c) {
  const ctx = c.lead_context;
  if (ctx?.items?.length) {
    const first = ctx.items[0];
    const work = [...(first.services || []), ...(first.addons || [])].join(", ");
    return { vehicle: first.label && first.label !== "Job" ? `${first.label}${first.size ? ` · ${first.size}` : ""}` : (first.size || ""), work: ctx.items.length > 1 ? `${work} (+${ctx.items.length - 1} more vehicle${ctx.items.length > 2 ? "s" : ""})` : work };
  }
  const answers = ctx?.answers ? Object.values(ctx.answers).filter(Boolean) : [];
  return { vehicle: "", work: answers.slice(0, 2).join(" · ") || c.notes || "" };
}

function NavItem({ item, active, onClick }) {
  const { Icon, label } = item;
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left", background: active ? P.surfaceHover : "transparent", color: active ? P.textPrimary : P.textSecondary }}>
      <Icon size={17} color={active ? P.accent : P.textMuted} />
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
    </button>
  );
}

function AtlasMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs><radialGradient id="atlas-globe-leads" cx="36%" cy="30%" r="75%"><stop offset="0%" stopColor={P.accentHover} /><stop offset="100%" stopColor={P.accent} /></radialGradient></defs>
      <path d="M18 82 L49 33 L51 33 L82 82" stroke={P.accent} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="50" cy="31" r="18" fill="url(#atlas-globe-leads)" />
      <ellipse cx="44" cy="24" rx="6.5" ry="4.2" fill="rgba(255,255,255,0.38)" />
    </svg>
  );
}

function BrandLockup({ businessId, realName, realLogoUrl }) {
  const [logo, setLogo] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => { if (realLogoUrl !== undefined) setLogo(realLogoUrl || null); }, [realLogoUrl]);
  const name = realName || "My Business";
  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setLogo(dataUrl);
      await supabase.from("businesses").update({ logo_url: dataUrl }).eq("id", businessId);
    } catch { /* logo change is optional here */ }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={() => fileRef.current?.click()} title="Change logo" style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", border: `1px solid ${P.border}`, background: logo ? `url(${logo}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
        {!logo && <span style={{ fontSize: 11, fontWeight: 700, color: P.accent }}>{initials(name)}</span>}
        {!logo && <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: P.accent, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${P.bg}` }}><Camera size={9} color={P.bg} /></div>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{name}</span>
    </div>
  );
}

function StatCard({ label, value, sub, tone, alert }) {
  return (
    <div style={{ background: alert ? "linear-gradient(180deg, rgba(255,107,94,0.10), #0F1B15)" : P.surface, border: `1px solid ${alert ? "rgba(255,107,94,0.5)" : P.border}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4, color: tone || P.textPrimary, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: P.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function LeadCard({ lead, now, commApp, businessName, onMove, onContact, onOpen }) {
  const { vehicle, work } = summaryLines(lead);
  const stageSince = new Date(lead.lead_stage_at || lead.created_at).getTime();
  const waited = now.getTime() - stageSince;
  let tone = P.textSecondary;
  let label = `${ago(waited)} in this stage`;
  if (lead.lead_stage === "new") {
    label = waited < 120000 ? "Just now" : `Waiting ${ago(waited)}`;
    tone = waited > HOUR ? P.danger : waited > HOUR / 2 ? P.warn : P.accent;
  } else if (lead.lead_stage === "contacted") {
    label = `Contacted ${ago(waited)} ago`;
    tone = waited > 24 * HOUR ? P.warn : P.textSecondary;
  } else if (lead.lead_stage === "quoted") {
    label = `Quoted ${ago(waited)} ago`;
    tone = waited > 48 * HOUR ? P.warn : P.textSecondary;
  } else if (lead.lead_stage === "booked") {
    label = `Booked ${ago(waited)} ago`;
    tone = P.accent;
  }
  const late = lead.lead_stage === "new" && waited > HOUR;
  const first = (lead.name || "").split(" ")[0] || "there";
  const msg = `Hi ${first}, this is ${businessName || "us"}. Thanks for reaching out! I got your request and will get you a final price shortly.`;
  const est = estimateText(lead.lead_context);
  const src = SOURCE_LABEL[lead.source];

  const btn = { flex: 1, minHeight: 36, borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: "nowrap", padding: "0 6px", minWidth: 0 };
  const primary = { ...btn, flex: "1 0 auto", border: `1px solid ${P.accent}`, background: P.accentSoft, color: P.accent };
  const ghost = { ...btn, flex: "0 0 auto", padding: "0 9px", border: `1px solid ${P.border}`, background: "#132018", color: P.textPrimary };

  return (
    <div style={{ background: P.surface, border: `1px solid ${late ? "rgba(255,107,94,0.6)" : P.border}`, boxShadow: late ? "0 0 0 3px rgba(255,107,94,0.08)" : "none", borderRadius: 13, padding: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <button onClick={onOpen} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0, fontWeight: 700, fontSize: 14, color: P.textPrimary }}>{lead.name}</button>
        {est && <div style={{ fontWeight: 800, fontSize: 15, color: P.accent, whiteSpace: "nowrap" }}>{est}</div>}
      </div>
      {vehicle && <div style={{ fontSize: 12, color: P.textSecondary, marginTop: 2 }}>{vehicle}</div>}
      {work && <div style={{ fontSize: 12, color: P.textSecondary, margin: "9px 0", lineHeight: 1.4 }}>{work}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: work ? 0 : 9 }}>
        {src && <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: "3px 8px", background: lead.source === "estimate_request" ? P.accentSoft : "rgba(91,184,255,0.13)", color: lead.source === "estimate_request" ? P.accent : P.blue }}>{src}</span>}
        <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: tone }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
        {lead.phone && lead.lead_stage === "new" && (
          <a href={textHref(lead.phone, msg, commApp)} onClick={() => onContact(lead, "text")} style={primary}>Text back</a>
        )}
        {lead.lead_stage === "contacted" && <button onClick={() => onOpen()} style={primary}>Make quote</button>}
        {lead.lead_stage === "quoted" && <button onClick={() => onMove(lead, "booked")} style={primary}>Mark booked</button>}
        {lead.lead_stage === "booked" && <button onClick={() => onMove(lead, "done")} style={primary}>Job done</button>}
        {lead.lead_stage === "new" && !lead.phone && <button onClick={() => onMove(lead, "contacted")} style={primary}>Mark contacted</button>}
        {lead.phone && <a href={callHref(lead.phone, commApp)} onClick={() => lead.lead_stage === "new" && onContact(lead, "call")} style={ghost}>Call</a>}
        <select value="" onChange={(e) => e.target.value && onMove(lead, e.target.value)} aria-label="Move lead" style={{ ...ghost, flex: "0 0 52px", appearance: "none", background: "#132018", textAlignLast: "center", padding: 0 }}>
          <option value="">Move</option>
          {STAGES.filter((s) => s.id !== lead.lead_stage).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          <option value="done">Done</option>
          <option value="lost">Lost</option>
        </select>
      </div>
    </div>
  );
}

function AddLeadModal({ businessId, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (name.trim().length < 2) { setError("Add a name."); return; }
    if (!phone.trim() && !email.trim()) { setError("Add a phone number or an email."); return; }
    setSaving(true);
    const { data, error: e } = await supabase.from("customers").insert({
      business_id: businessId, name: name.trim(), phone: phone.trim() || null, email: email.trim() || null,
      notes: notes.trim() || null, source: "manual_lead",
    }).select("*").single();
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved(data);
  }
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
      <div style={{ position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(420px, calc(100vw - 28px))", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 16, padding: 20, zIndex: 41 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Add a lead</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: P.textMuted, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <input placeholder="Phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
          <input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <textarea placeholder="What do they want? (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        {error && <p style={{ fontSize: 12.5, color: P.danger, margin: "10px 0 0" }}>{error}</p>}
        <button onClick={save} disabled={saving} style={{ marginTop: 14, width: "100%", background: P.accent, color: P.bg, border: "none", borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Add lead"}</button>
      </div>
    </>
  );
}

export default function AtlasLeads({ onNavigate, currentPage = "leads" }) {
  const { businessId, businessName, businessLogoUrl, businessPreferredCommApp, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [leads, setLeads] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");
  const [tab, setTab] = useState("new");
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("customers").select("*").eq("business_id", businessId).not("lead_stage", "is", null).order("created_at", { ascending: false });
    if (error) setDataError(error.message);
    else { setDataError(""); setLeads(data || []); }
    setLoadingData(false);
  }

  useEffect(() => {
    if (!businessId) return;
    load();
    const channel = supabase
      .channel(`leads-board-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `business_id=eq.${businessId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  async function move(lead, stage) {
    const stamp = new Date().toISOString();
    setLeads((list) => list.map((l) => (l.id === lead.id ? { ...l, lead_stage: stage, lead_stage_at: stamp } : l)));
    const { error } = await supabase.from("customers").update({ lead_stage: stage, lead_stage_at: stamp }).eq("id", lead.id);
    if (error) { setDataError(error.message); load(); }
  }
  async function contacted(lead, method) {
    const stamp = new Date().toISOString();
    setLeads((list) => list.map((l) => (l.id === lead.id ? { ...l, lead_stage: "contacted", lead_stage_at: stamp, last_contacted_at: stamp } : l)));
    const { error } = await supabase.from("customers").update({ lead_stage: "contacted", lead_stage_at: stamp, last_contacted_at: stamp, last_contact_method: method }).eq("id", lead.id);
    if (error) { setDataError(error.message); load(); }
  }

  const loading = bizLoading || (!!businessId && loadingData);
  const error = bizError || dataError;
  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, []]));
  const closed = [];
  for (const l of leads) (byStage[l.lead_stage] ? byStage[l.lead_stage] : closed).push(l);
  for (const s of STAGES) byStage[s.id].sort((a, b) => new Date(a.lead_stage_at || a.created_at) - new Date(b.lead_stage_at || b.created_at));

  const t = now.getTime();
  const waiting = byStage.new.filter((l) => t - new Date(l.lead_stage_at || l.created_at).getTime() > HOUR);
  const oldest = waiting.length ? t - new Date(waiting[0].lead_stage_at || waiting[0].created_at).getTime() : 0;
  const weekLeads = leads.filter((l) => t - new Date(l.created_at).getTime() < 7 * 24 * HOUR);
  const fromQuote = weekLeads.filter((l) => l.source === "estimate_request").length;
  const open = [...byStage.new, ...byStage.contacted, ...byStage.quoted];
  const openValue = open.reduce((sum, l) => sum + (Number(l.lead_context?.estimate_low) || 0), 0);
  const waitingNow = byStage.new.length;

  function renderLane(stage) {
    const items = byStage[stage.id];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "rgba(15,27,21,0.45)", border: `1px dashed ${P.border}`, borderRadius: 16, padding: 10, minHeight: 90 }}>
        {items.length === 0 && <div style={{ fontSize: 12.5, color: P.textMuted, textAlign: "center", padding: "22px 6px" }}>{stage.id === "new" ? "No new leads. New requests show up here." : "Nothing here."}</div>}
        {items.map((l) => (
          <LeadCard key={l.id} lead={l} now={now} commApp={businessPreferredCommApp} businessName={businessName} onMove={move} onContact={contacted} onOpen={() => onNavigate("customers", { customerId: l.id })} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <div className="hidden lg:flex" style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${P.border}`, flexDirection: "column", padding: "22px 14px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 28 }}>
          <AtlasMark size={24} /><span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Atlas</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((item) => <NavItem key={item.id} item={item} active={currentPage === item.id} onClick={() => onNavigate(item.id)} />)}
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: `1px solid ${P.border}`, paddingTop: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: businessLogoUrl ? `url(${businessLogoUrl}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: P.accent }}>{!businessLogoUrl && initials(businessName || "My Business")}</div>
          <div><div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>{businessName || "My Business"}</div><div style={{ fontSize: 11, color: P.textMuted }}>Owner</div></div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingBottom: 88 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <BrandLockup businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
            <div className="hidden lg:flex" style={{ alignItems: "center", gap: 14 }}>
              <div style={{ width: 1, height: 20, background: P.border }} />
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Leads <span style={{ color: P.textMuted }}>· {formatDateTime(now)}</span></span>
            </div>
          </div>
          <button onClick={() => setAddOpen(true)} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6, flexShrink: 0 }}><Plus size={14} /> Add lead</button>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: P.textPrimary }}>Leads</div>
            <div style={{ fontSize: 13, color: P.textSecondary, marginTop: 3 }}>
              {waitingNow === 0 ? "Nobody is waiting on you right now." : waiting.length > 0 ? `${waitingNow} ${waitingNow === 1 ? "person is" : "people are"} waiting on you. Call the red ones first.` : `${waitingNow} new ${waitingNow === 1 ? "lead" : "leads"}. Reply fast to win the job.`}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <StatCard label="Waiting over 1 hour" value={waiting.length} sub={waiting.length ? `Oldest: ${ago(oldest)}` : "All caught up"} tone={waiting.length ? P.danger : P.accent} alert={waiting.length > 0} />
            <StatCard label="New leads this week" value={weekLeads.length} sub={fromQuote ? `${fromQuote} from Instant Quote` : undefined} />
            <StatCard label="Booked" value={byStage.booked.length} sub="coming up" />
            <StatCard label="Open lead value" value={money(openValue)} sub="from estimates shown" tone={P.accent} />
          </div>

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading leads…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: 18, fontSize: 13, color: P.danger }}>{error}</div>
          ) : (
            <>
              <div className="flex lg:hidden" style={{ gap: 6, overflowX: "auto" }}>
                {STAGES.map((s) => (
                  <button key={s.id} onClick={() => setTab(s.id)} style={{ flex: 1, whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 700, padding: "9px 12px", borderRadius: 10, cursor: "pointer", background: tab === s.id ? P.accentSoft : P.surface, border: `1px solid ${tab === s.id ? P.accent : P.border}`, color: tab === s.id ? P.accent : P.textSecondary }}>
                    {s.label} {byStage[s.id].length}
                  </button>
                ))}
              </div>
              <div className="lg:hidden">{renderLane(STAGES.find((s) => s.id === tab))}</div>

              <div className="hidden lg:grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
                {STAGES.map((s) => (
                  <div key={s.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textSecondary }}>
                      <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 7, background: s.color }} />{s.label}</span>
                      <em style={{ fontStyle: "normal", background: "#132018", borderRadius: 99, padding: "2px 9px", fontSize: 11, color: P.textPrimary }}>{byStage[s.id].length}</em>
                    </div>
                    {renderLane(s)}
                  </div>
                ))}
              </div>

              {closed.length > 0 && (
                <div>
                  <button onClick={() => setShowClosed((v) => !v)} style={{ background: "transparent", border: "none", color: P.textMuted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 0", marginBottom: showClosed ? 10 : 0 }}>
                    {showClosed ? "Hide" : "Show"} finished and lost ({closed.length})
                  </button>
                  {showClosed && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                      {closed.map((l) => (
                        <div key={l.id} style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: P.textPrimary }}>{l.name}</div>
                            <div style={{ fontSize: 11.5, color: l.lead_stage === "lost" ? P.danger : P.accent, fontWeight: 700 }}>{l.lead_stage === "lost" ? "Lost" : "Done"}</div>
                          </div>
                          <button onClick={() => move(l, "new")} style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Reopen</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
              <button key={p.id} onClick={() => { onNavigate(p.id); setMoreOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 9, border: "none", background: "transparent", color: P.textSecondary, cursor: "pointer", textAlign: "left" }}>
                <p.Icon size={16} color={P.textMuted} />
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{p.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {addOpen && <AddLeadModal businessId={businessId} onClose={() => setAddOpen(false)} onSaved={(row) => { setLeads((l) => [row, ...l]); setAddOpen(false); setTab("new"); }} />}
    </div>
  );
}
