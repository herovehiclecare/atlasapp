import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Plus,
  Sparkles, Search, MoreHorizontal, SlidersHorizontal,
  Phone, MessageSquare, ChevronRight, Download, ChevronDown, Pencil, Camera,
  X, Loader2, ListChecks,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { formatDate, downloadCsv, resizeImageToDataUrl, useLiveClock, formatDateTime } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = ["#18D97A", "#4C8DFF", "#9B6BFF", "#F5A623", "#FF7A63", "#4FD1C5"];

const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-customers-v";
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

function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }
function hue(i) { return HUES[((i % HUES.length) + HUES.length) % HUES.length]; }
function colorForId(id) {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return hue(sum);
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
        <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: P.accent, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${P.bg}` }}><Camera size={9} color={P.bg} /></div>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      {editingName ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && commitName()} style={{ background: "transparent", border: "none", borderBottom: `1px solid ${P.accent}`, color: P.textPrimary, fontSize: 15, fontWeight: 700, outline: "none", width: 140 }} />
      ) : (
        <button onClick={() => setEditingName(true)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{name}</span>
          <Pencil size={11} color={P.textMuted} />
        </button>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: P.textPrimary, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: P.textSecondary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function QuickActions({ size = 32, iconSize = 13, phone, onOpen }) {
  const actionStyle = { width: size, height: size, borderRadius: 8, border: `1px solid ${P.border}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {phone ? (
        <a href={`tel:${phone}`} title={`Call ${phone}`} style={{ ...actionStyle, color: P.textSecondary, textDecoration: "none", cursor: "pointer" }}><Phone size={iconSize} /></a>
      ) : (
        <span title="No phone on file" style={{ ...actionStyle, color: P.textMuted, opacity: 0.4, cursor: "default" }}><Phone size={iconSize} /></span>
      )}
      {phone ? (
        <a href={`sms:${phone}`} title={`Text ${phone}`} style={{ ...actionStyle, color: P.textSecondary, textDecoration: "none", cursor: "pointer" }}><MessageSquare size={iconSize} /></a>
      ) : (
        <span title="No phone on file" style={{ ...actionStyle, color: P.textMuted, opacity: 0.4, cursor: "default" }}><MessageSquare size={iconSize} /></span>
      )}
      <button onClick={onOpen} style={{ ...actionStyle, color: P.textMuted, cursor: "pointer" }}><ChevronRight size={iconSize + 1} /></button>
    </div>
  );
}

/* ---------------------------------- list view ---------------------------------- */

function RowsView({ list, selected, toggleSelect, onOpenDetail }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: "hidden" }}>
      {list.map((c, i) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < list.length - 1 ? `1px solid ${P.border}` : "none" }}>
          <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} style={{ accentColor: P.accent, flexShrink: 0 }} />
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${hue(i)}22`, color: hue(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{c.name}</div>
            <div style={{ fontSize: 12, color: P.textMuted, marginTop: 2 }}>{c.phone || "No phone"}{c.email ? ` · ${c.email}` : ""}</div>
          </div>
          <div className="hidden lg:block" style={{ textAlign: "right", flexShrink: 0, marginRight: 8 }}>
            <div style={{ fontSize: 11, color: P.textMuted }}>Added {formatDate(c.created_at)}</div>
          </div>
          <QuickActions phone={c.phone} onOpen={() => onOpenDetail(c)} />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- Customer Detail drawer ---------------------------------- */

function CustomerDetail({ customer, onClose }) {
  if (!customer) return null;
  const color = colorForId(customer.id);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)", background: P.bg, borderLeft: `1px solid ${P.border}`, zIndex: 41, overflowY: "auto", boxShadow: "-20px 0 60px rgba(0,0,0,0.4)" }}>
        <div style={{ position: "sticky", top: 0, background: P.bg, borderBottom: `1px solid ${P.border}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(customer.name)}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{customer.name}</div>
              <div style={{ fontSize: 11.5, color: P.textMuted }}>Customer since {formatDate(customer.created_at)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}><Phone size={13} /> Call</a>
            ) : (
              <span title="No phone on file" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textMuted, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, opacity: 0.5, cursor: "default" }}><Phone size={13} /> Call</span>
            )}
            {customer.phone ? (
              <a href={`sms:${customer.phone}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}><MessageSquare size={13} /> Text</a>
            ) : (
              <span title="No phone on file" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textMuted, borderRadius: 9, padding: "9px", fontSize: 12.5, fontWeight: 600, opacity: 0.5, cursor: "default" }}><MessageSquare size={13} /> Text</span>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, marginBottom: 8 }}>Contact</div>
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: P.textSecondary }}>Phone: {customer.phone || "—"}</div>
              <div style={{ fontSize: 12.5, color: P.textSecondary }}>Email: {customer.email || "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------- Add Customer modal ---------------------------------- */

function AddCustomerModal({ businessId, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("customers")
      .insert({ business_id: businessId, name: name.trim(), email: email.trim() || null, phone: phone.trim() || null })
      .select()
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onAdded(data);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(420px, calc(100vw - 32px))", background: P.bg, border: `1px solid ${P.border}`, borderRadius: 16, zIndex: 51, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>Add customer</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12.5, color: P.danger }}>{error}</div>}
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 }}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
          </div>
          <button type="submit" disabled={saving} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.85 : 1 }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Add customer"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasCustomers({ onNavigate, currentPage = "customers" }) {
  const { businessId, businessName, businessLogoUrl, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function load() {
      setLoadingCustomers(true);
      const { data: rows, error: fetchError } = await supabase
        .from("customers")
        .select("*")
        .eq("business_id", businessId)
        .order("name", { ascending: true });

      if (cancelled) return;
      if (fetchError) {
        setCustomersError(fetchError.message);
      } else {
        setCustomers(rows);
      }
      setLoadingCustomers(false);
    }

    load();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && loadingCustomers);
  const error = bizError || customersError;

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || (c.phone || "").includes(query));
  const withEmail = customers.filter((c) => c.email).length;
  const missingPhone = customers.filter((c) => !c.phone).length;

  function toggleSelect(id) { setSelected((s) => (s.includes(id) ? s.filter((n) => n !== id) : [...s, id])); }

  function handleAdded(customer) {
    setCustomers((cs) => [...cs, customer].sort((a, b) => a.name.localeCompare(b.name)));
    setAddOpen(false);
  }

  function handleExport() {
    const rows = [["Name", "Email", "Phone", "Customer Since"]].concat(
      filtered.map((c) => [c.name, c.email || "", c.phone || "", formatDate(c.created_at)])
    );
    downloadCsv(rows, "customers.csv");
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <BrandLockup size={30} businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
            <div className="hidden lg:flex" style={{ alignItems: "center", gap: 14 }}>
              <div style={{ width: 1, height: 20, background: P.border }} />
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Customers <span style={{ color: P.textMuted }}>· {customers.length} total · {formatDateTime(now)}</span></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={handleExport} disabled={filtered.length === 0} className="hidden lg:flex" style={{ alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: filtered.length === 0 ? "default" : "pointer", opacity: filtered.length === 0 ? 0.5 : 1 }}><Download size={13} /> Export</button>
            <button onClick={() => setAddOpen(true)} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}><Plus size={14} /> Add Customer</button>
          </div>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <StatCard label="Total Customers" value={customers.length} />
            <StatCard label="With Email" value={withEmail} sub={`${customers.length - withEmail} missing`} />
            <StatCard label="Missing Phone" value={missingPhone} />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", display: "flex", alignItems: "center", gap: 8, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "9px 12px" }}>
              <Search size={15} color={P.textMuted} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 13.5 }} />
            </div>
            <button style={{ display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 10, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <SlidersHorizontal size={13} /> Name A–Z <ChevronDown size={13} />
            </button>
          </div>

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading customers…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted }}>
              {customers.length === 0 ? "No customers yet — add your first one." : `No customers match "${query}"`}
            </div>
          ) : (
            <RowsView list={filtered} selected={selected} toggleSelect={toggleSelect} onOpenDetail={setDetailCustomer} />
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

      {addOpen && <AddCustomerModal businessId={businessId} onClose={() => setAddOpen(false)} onAdded={handleAdded} />}
      {detailCustomer && <CustomerDetail customer={detailCustomer} onClose={() => setDetailCustomer(null)} />}
    </div>
  );
}
