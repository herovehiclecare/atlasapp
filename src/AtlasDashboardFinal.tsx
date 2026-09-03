import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Plus,
  DollarSign, Briefcase, AlertCircle, ChevronRight, Sparkles, Bell,
  MoreHorizontal, ArrowUpRight, EyeOff, Eye,
  TrendingUp, Pencil, Phone, Camera, X, ListChecks, Check,
} from "lucide-react";
import { BarChart, Bar, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { resizeImageToDataUrl, svcPrice, parseDate, useLiveClock, formatDateTime, mergeBusinessJsonb } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const HUES = { blue: "#4C8DFF", violet: "#9B6BFF", amber: "#F5A623", emerald: P.accent, coral: P.secondary };
const STATUS = { scheduled: "#4C8DFF", in_progress: "#F5A623", completed: P.accent, cancelled: P.danger };
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function AtlasMark({ size = 22 }) {
  const gid = "atlas-globe-final3";
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
const PINNED = [
  { id: "customers", label: "Customers", Icon: Users }, { id: "quote", label: "QuickQuote", Icon: Sparkles },
  { id: "schedule", label: "Schedule", Icon: Calendar }, { id: "calls", label: "Call List", Icon: Phone },
];
/* ---------------------------------- data helpers ---------------------------------- */

function money(n) {
  return `$${Math.round(n || 0).toLocaleString()}`;
}
function estimateJobPrice(job, servicesById) {
  const ids = Array.isArray(job.service_ids) ? job.service_ids : [];
  return ids.reduce((sum, id) => {
    const svc = servicesById[id];
    if (!svc) return sum;
    return sum + svcPrice(svc, job.vehicles);
  }, 0);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";
}
function startOfWeek(d) {
  const n = new Date(d);
  const day = n.getDay();
  n.setDate(n.getDate() + (day === 0 ? -6 : 1 - day));
  n.setHours(0, 0, 0, 0);
  return n;
}
function quoteAmount(quote) {
  const t = quote.totals || {};
  return t.isRange ? t.rangeHigh || 0 : t.total || 0;
}
function quoteVehicleLabel(quote, vehiclesById) {
  const ids = quote.line_items?.vehicleIds || [];
  for (const id of ids) if (vehiclesById[id]) return vehiclesById[id].label;
  return null;
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/* ---------------------------------- shared bits ---------------------------------- */

function NavItem({ item, active, onClick }) {
  const { Icon, label } = item;
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer", textAlign: "left", background: active ? P.surfaceHover : "transparent", color: active ? P.textPrimary : P.textSecondary }}>
      <Icon size={17} color={active ? P.accent : P.textMuted} />
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500 }}>{label}</span>
    </button>
  );
}
function SectionToggle({ editMode, visible, onToggle }) {
  if (!editMode) return null;
  return (
    <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 5, background: visible ? "transparent" : P.accentSoft, border: `1px solid ${visible ? P.border : P.accent}`, borderRadius: 7, padding: "4px 9px", color: visible ? P.textMuted : P.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
      {visible ? <EyeOff size={12} /> : <Eye size={12} />} {visible ? "Hide" : "Show"}
    </button>
  );
}
function Section({ id, title, action, onAction, editMode, visible, onToggle, pulse, children }) {
  if (!visible && !editMode) return null;
  return (
    <div id={id} style={visible ? { background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: "hidden", boxShadow: pulse ? `0 0 0 3px ${P.accentSoft}` : "none", transition: "box-shadow 0.4s ease" } : { border: `1px dashed ${P.border}`, borderRadius: 10, padding: "14px 18px", opacity: 0.5 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: visible ? "14px 18px" : 0, borderBottom: visible ? `1px solid ${P.border}` : "none" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: visible ? P.textPrimary : P.textMuted, display: "flex", alignItems: "center", gap: 7 }}>
          {id === "insights" && <Sparkles size={14} color={P.accent} />} {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {visible && action && !editMode && <button onClick={onAction} style={{ background: "transparent", border: "none", color: P.textMuted, fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>{action} <ChevronRight size={13} /></button>}
          <SectionToggle editMode={editMode} visible={visible} onToggle={onToggle} />
        </div>
      </div>
      {visible && <div>{children}</div>}
    </div>
  );
}

/* ---------------------------------- Follow-ups widget ---------------------------------- */

function FollowUpsQuickAdd({ customers, onAdd }) {
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(todayStr());
  const [customerId, setCustomerId] = useState("");

  function submit(e) {
    e.preventDefault();
    if (!note.trim()) return;
    onAdd(note, dueDate, customerId);
    setNote("");
    setDueDate(todayStr());
    setCustomerId("");
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 6, padding: "12px 18px", borderBottom: `1px solid ${P.border}`, flexWrap: "wrap" }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a follow-up…" style={{ flex: "1 1 160px", background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, color: P.textPrimary, outline: "none" }} />
      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 8, padding: "7px 8px", fontSize: 12, color: P.textPrimary, outline: "none", width: 132, colorScheme: "dark" }} />
      {customers.length > 0 && (
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 8, padding: "7px 8px", fontSize: 12, color: customerId ? P.textPrimary : P.textMuted, outline: "none", maxWidth: 120 }}>
          <option value="">No customer</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <button type="submit" style={{ background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center" }}><Plus size={13} /></button>
    </form>
  );
}

function FollowUpsList({ items, customersById, onComplete }) {
  if (items.length === 0) {
    return <div style={{ padding: "16px 18px", fontSize: 12.5, color: P.textMuted, textAlign: "center" }}>Nothing due — you're caught up.</div>;
  }
  return (
    <>
      {items.slice(0, 5).map((f, i) => {
        const overdue = f.due_date && f.due_date < todayStr();
        const names = (f.customer_ids || []).map((id) => customersById[id]?.name).filter(Boolean);
        const namesLabel = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ");
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 18px", borderBottom: i < Math.min(items.length, 5) - 1 ? `1px solid ${P.border}` : "none" }}>
            <button onClick={() => onComplete(f)} title="Mark as done" style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${P.border}`, background: "transparent", cursor: "pointer", flexShrink: 0, marginTop: 2, padding: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: P.textPrimary, lineHeight: 1.4 }}>{f.note}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                {namesLabel && <span style={{ fontSize: 11, color: P.textSecondary }}>{namesLabel}</span>}
                {f.due_date && <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? P.danger : P.accent }}>{overdue ? "Overdue" : "Today"}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------------------------------- KPI tile (colored circles, no pills, overlap-safe) ---------------------------------- */

function Tile({ stat, tileClass, big, earnings, onNavigate }) {
  const color = HUES[stat.hue];
  const tint = `${color}22`;
  const clickable = !!(stat.nav && onNavigate);
  return (
    <div
      className={tileClass}
      onClick={clickable ? () => onNavigate(stat.nav) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(stat.nav); } } : undefined}
      style={{ minWidth: 0, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 18, padding: big ? 18 : 14, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 0, overflow: "hidden", cursor: clickable ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: big ? 11 : 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted, minWidth: 0, flex: 1, lineHeight: 1.35 }}>
          {stat.label}
        </div>
        <div style={{ width: big ? 34 : 26, height: big ? 34 : 26, borderRadius: "50%", background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <stat.Icon size={big ? 15 : 12} color={color} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: big ? 30 : 19, fontWeight: 800, color: P.textPrimary, letterSpacing: "-0.01em", marginTop: 8 }}>{stat.value}</div>
        <div style={{ fontSize: big ? 12 : 10.5, color: P.textSecondary, marginTop: 3, lineHeight: 1.35 }}>{stat.sub}</div>
        {big && (
          <div style={{ width: "100%", height: 38, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={earnings}><Bar dataKey="value" fill={P.accent} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfitBanner({ editMode, visible, onToggle, jobsToday, revenueToday }) {
  const [costPerJob, setCostPerJob] = useState(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  if (!visible && !editMode) return null;

  if (!visible && editMode) {
    return (
      <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px dashed ${P.border}`, borderRadius: 16, padding: "14px 18px", color: P.textMuted, fontSize: 12.5, cursor: "pointer", width: "100%" }}>
        <Eye size={14} /> Profit banner is hidden — click to show it again
      </button>
    );
  }

  if (costPerJob === null) {
    return (
      <div style={{ position: "relative", background: P.surface, border: `1px dashed ${P.border}`, borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        {editMode && (
          <SectionToggle editMode={editMode} visible={visible} onToggle={onToggle} />
        )}
        {!editMode && (
          <button onClick={onToggle} title="Hide this" style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", padding: 4 }}>
            <X size={14} />
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <TrendingUp size={15} color={P.accent} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>Profit isn't set up yet</div>
            <div style={{ fontSize: 12, color: P.textSecondary, marginTop: 2 }}>Add your average cost per job once — Atlas calculates profit automatically every day after that.</div>
          </div>
        </div>
        {!open ? (
          <button onClick={() => setOpen(true)} style={{ flexShrink: 0, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            Set up costs →
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: P.bgTop, border: `1px solid ${P.border}`, borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ fontSize: 12.5, color: P.textMuted }}>$</span>
              <input autoFocus type="number" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="avg. cost / job" style={{ width: 100, background: "transparent", border: "none", outline: "none", color: P.textPrimary, fontSize: 12.5 }} />
            </div>
            <button onClick={() => draft && setCostPerJob(Number(draft))} style={{ background: P.accent, border: "none", color: P.bg, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Save</button>
          </div>
        )}
      </div>
    );
  }

  const estCost = costPerJob * jobsToday;
  const profit = revenueToday - estCost;
  return (
    <div style={{ position: "relative", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      {editMode && <SectionToggle editMode={editMode} visible={visible} onToggle={onToggle} />}
      {!editMode && (
        <button onClick={onToggle} title="Hide this" style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", padding: 4 }}>
          <X size={14} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <TrendingUp size={15} color={P.accent} />
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>Today's Profit</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: P.textPrimary, marginTop: 2 }}>${profit.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: P.textSecondary, textAlign: "right" }}>
        Revenue ${revenueToday.toLocaleString()} − est. costs ${estCost.toLocaleString()} ({jobsToday} jobs)
        <br />
        <button onClick={() => { setCostPerJob(null); setOpen(true); setDraft(String(costPerJob)); }} style={{ background: "transparent", border: "none", color: P.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 3 }}>
          Edit cost basics
        </button>
      </div>
    </div>
  );
}

function BentoGrid({ kpi, earnings, onNavigate }) {
  return (
    <>
      {/* Fixed at 4 columns, this squeezed the single-column tiles (Jobs,
          Customers, Outstanding, Avg. Ticket) to ~90px wide on a phone,
          wrapping their uppercase labels onto a second line that then
          collided with the icon badge. Below 640px this drops to a 2-column
          layout instead, with each tile given its own full-width row. */}
      <style>{`
        .atlas-bento { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); grid-auto-rows: minmax(132px, auto); gap: 12px; }
        .atlas-bento .t-revenue { grid-column: 1 / 3; grid-row: 1 / 3; }
        .atlas-bento .t-jobs { grid-column: 3; grid-row: 1; }
        .atlas-bento .t-customers { grid-column: 4; grid-row: 1; }
        .atlas-bento .t-pipeline { grid-column: 3 / 5; grid-row: 2; }
        .atlas-bento .t-outstanding { grid-column: 1 / 3; grid-row: 3; }
        .atlas-bento .t-avgticket { grid-column: 3 / 5; grid-row: 3; }
        @media (max-width: 640px) {
          .atlas-bento { grid-template-columns: repeat(2, minmax(0,1fr)); grid-auto-rows: minmax(110px, auto); }
          .atlas-bento .t-revenue { grid-column: 1 / 3; grid-row: 1; }
          .atlas-bento .t-jobs { grid-column: 1; grid-row: 2; }
          .atlas-bento .t-customers { grid-column: 2; grid-row: 2; }
          .atlas-bento .t-pipeline { grid-column: 1 / 3; grid-row: 3; }
          .atlas-bento .t-outstanding { grid-column: 1; grid-row: 4; }
          .atlas-bento .t-avgticket { grid-column: 2; grid-row: 4; }
        }
      `}</style>
      <div className="atlas-bento">
        <Tile stat={kpi.revenue} tileClass="t-revenue" big earnings={earnings} onNavigate={onNavigate} />
        <Tile stat={kpi.jobs} tileClass="t-jobs" onNavigate={onNavigate} />
        <Tile stat={kpi.customers} tileClass="t-customers" onNavigate={onNavigate} />
        <Tile stat={kpi.pipeline} tileClass="t-pipeline" onNavigate={onNavigate} />
        <Tile stat={kpi.outstanding} tileClass="t-outstanding" onNavigate={onNavigate} />
        <Tile stat={kpi.avgTicket} tileClass="t-avgticket" onNavigate={onNavigate} />
      </div>
    </>
  );
}

/* ---------------------------------- editable branding ---------------------------------- */

function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }

function BrandLockup({ size = 34, businessId, realName, realLogoUrl }) {
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
      <button
        onClick={() => fileRef.current?.click()}
        title="Change logo"
        style={{
          position: "relative", width: size, height: size, borderRadius: "50%", border: `1px solid ${P.border}`,
          background: logo ? `url(${logo}) center/cover` : P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0, padding: 0,
        }}
      >
        {!logo && <span style={{ fontSize: size * 0.36, fontWeight: 700, color: P.accent }}>{initials(name)}</span>}
        {!logo && (
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: P.accent, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${P.bg}` }}>
            <Camera size={9} color={P.bg} />
          </div>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      {editingName ? (
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && commitName()}
          style={{ background: "transparent", border: "none", borderBottom: `1px solid ${P.accent}`, color: P.textPrimary, fontSize: 15, fontWeight: 700, outline: "none", width: 140 }}
        />
      ) : (
        <button onClick={() => setEditingName(true)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: P.textPrimary }}>{name}</span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------- header ---------------------------------- */

function ActionButtons({ compact, onNewJob, onNewQuote }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <button onClick={onNewJob} title="New Job" aria-label="New Job" style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 8, padding: compact ? "6px 10px" : "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", transform: "translateY(3px)" }}>
        <Calendar size={13} /> <span className="hidden sm:inline">New Job</span>
      </button>
      <button onClick={onNewQuote} title="New Quote" aria-label="New Quote" style={{ display: "flex", alignItems: "center", gap: 5, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: compact ? "7px 12px" : "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
        <Sparkles size={14} /> <span className="hidden sm:inline">New Quote</span>
      </button>
    </div>
  );
}

function NotificationBell({ dueFollowUps = [], onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="hidden lg:flex" onClick={() => setOpen((o) => !o)} style={{ position: "relative", width: 32, height: 32, borderRadius: 8, border: `1px solid ${P.border}`, background: open ? P.surfaceHover : "transparent", alignItems: "center", justifyContent: "center", color: P.textSecondary, cursor: "pointer" }}>
        <Bell size={14} />
        {dueFollowUps.length > 0 && <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: P.danger, border: `1.5px solid ${P.bg}` }} />}
      </button>
      {open && (
        <div style={{ position: "absolute", top: 40, right: 0, width: 260, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.4)", padding: "12px 14px", zIndex: 30 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary, marginBottom: 8 }}>Notifications</div>
          {dueFollowUps.length === 0 ? (
            <div style={{ fontSize: 12, color: P.textMuted }}>No notifications yet</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                {dueFollowUps.slice(0, 5).map((f) => (
                  <div key={f.id} style={{ fontSize: 12, color: P.textSecondary, lineHeight: 1.4 }}>
                    <span style={{ color: f.due_date < todayStr() ? P.danger : P.accent, fontWeight: 600 }}>{f.due_date < todayStr() ? "Overdue" : "Today"}</span> — {f.note}
                  </div>
                ))}
              </div>
              <button onClick={() => { setOpen(false); onNavigate("followups"); }} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: P.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                View all follow-ups →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HeaderStaggered({ editMode, setEditMode, businessId, businessName, businessLogoUrl, onNavigate, dueFollowUps }) {
  const now = useLiveClock();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10 }}>
      <div>
        <BrandLockup size={32} businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
        <div style={{ fontSize: 12, color: P.textMuted, marginTop: 4, marginLeft: 42 }}>Dashboard · {formatDateTime(now)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <NotificationBell dueFollowUps={dueFollowUps} onNavigate={onNavigate} />
        {/* Customize control removed from here — lives in Settings once built */}
        <ActionButtons compact onNewJob={() => onNavigate("schedule")} onNewQuote={() => onNavigate("quote")} />
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasDashboardFinal({ onNavigate, currentPage = "dashboard" }) {
  const { businessId, businessName, businessLogoUrl, businessUiPrefs, businessNotificationPrefs, loading: bizLoading, error: bizError } = useBusinessId();
  const [editMode, setEditMode] = useState(false);
  const [visible, setVisible] = useState({ insights: true, schedule: true, quotes: true, chart: true, invoices: true, aiFab: true, profitBanner: true, followups: true });
  const [pulse, setPulse] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (businessUiPrefs?.dashboard) setVisible((v) => ({ ...v, ...businessUiPrefs.dashboard }));
  }, [businessUiPrefs]);

  function toggle(id) {
    setVisible((v) => {
      const next = { ...v, [id]: !v[id] };
      if (businessId) {
        mergeBusinessJsonb(supabase, businessId, "ui_prefs", { dashboard: next }).catch((err) => console.error(err));
      }
      return next;
    });
  }

  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [customersCount, setCustomersCount] = useState(0);
  const [newCustomersThisMonth, setNewCustomersThisMonth] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [servicesById, setServicesById] = useState({});
  const [vehiclesById, setVehiclesById] = useState({});
  const [followUps, setFollowUps] = useState([]);
  const [customersList, setCustomersList] = useState([]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      setDataError("");
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      try {
        const [customersRes, newCustomersRes, jobsRes, quotesRes, invoicesRes, servicesRes, vehiclesRes, followUpsRes, customersListRes] = await Promise.all([
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", monthStart.toISOString()),
          supabase.from("jobs").select("id, customer_id, vehicle_id, service_ids, scheduled_at, status, customers(name), vehicles(label, size_class)").eq("business_id", businessId),
          supabase.from("quotes").select("id, customer_id, status, line_items, totals, created_at, customers(name)").eq("business_id", businessId).order("created_at", { ascending: false }),
          supabase.from("invoices").select("id, customer_id, amount, status, due_date, created_at, customers(name)").eq("business_id", businessId).order("created_at", { ascending: false }),
          supabase.from("services").select("id, price_car_low, price_suv_low").eq("business_id", businessId),
          supabase.from("vehicles").select("id, label").eq("business_id", businessId),
          supabase.from("follow_ups").select("*").eq("business_id", businessId).eq("status", "pending").order("due_date", { ascending: true, nullsFirst: false }),
          supabase.from("customers").select("id, name").eq("business_id", businessId).order("name", { ascending: true }),
        ]);
        for (const res of [customersRes, newCustomersRes, jobsRes, quotesRes, invoicesRes, servicesRes, vehiclesRes, followUpsRes, customersListRes]) {
          if (res.error) throw res.error;
        }
        if (cancelled) return;
        setCustomersCount(customersRes.count || 0);
        setNewCustomersThisMonth(newCustomersRes.count || 0);
        setJobs(jobsRes.data || []);
        setQuotes(quotesRes.data || []);
        setInvoices(invoicesRes.data || []);
        setServicesById(Object.fromEntries((servicesRes.data || []).map((s) => [s.id, s])));
        setVehiclesById(Object.fromEntries((vehiclesRes.data || []).map((v) => [v.id, v])));
        setFollowUps(followUpsRes.data || []);
        setCustomersList(customersListRes.data || []);
      } catch (err) {
        if (!cancelled) setDataError(err.message || "Couldn't load dashboard data.");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && dataLoading);
  const error = bizError || dataError;

  const customersById = Object.fromEntries(customersList.map((c) => [c.id, c]));
  const todayIso = todayStr();
  const overdueFollowUps = followUps.filter((f) => f.due_date && f.due_date < todayIso);
  const todayFollowUps = followUps.filter((f) => f.due_date === todayIso);
  const upcomingFollowUps = followUps.filter((f) => !f.due_date || f.due_date > todayIso);
  const dueFollowUps = [...overdueFollowUps, ...todayFollowUps];
  // The bell is specifically an alert — it respects the on/off toggles in
  // Settings → Notifications, unlike the Follow-ups card below (which always
  // shows the real picture regardless of alert preferences).
  const notifyOverdue = businessNotificationPrefs?.followUpOverdue ?? true;
  const notifyToday = businessNotificationPrefs?.followUpToday ?? true;
  const bellFollowUps = [...(notifyOverdue ? overdueFollowUps : []), ...(notifyToday ? todayFollowUps : [])];

  const today = new Date();
  const todaysJobs = jobs.filter((j) => j.scheduled_at && sameDay(new Date(j.scheduled_at), today));
  const todaysActiveJobs = todaysJobs.filter((j) => j.status !== "cancelled");
  // "Revenue" means money actually earned, not the estimated value of work
  // that's merely scheduled — only completed jobs count toward it (matches
  // the "N jobs completed" subtext shown right under the figure).
  const todaysCompletedJobs = todaysActiveJobs.filter((j) => j.status === "completed");
  const todaysRevenue = todaysCompletedJobs.reduce((sum, j) => sum + estimateJobPrice(j, servicesById), 0);
  const todaysCompleted = todaysCompletedJobs.length;
  const todaysRemaining = todaysActiveJobs.filter((j) => j.status === "scheduled" || j.status === "in_progress").length;
  const todaysSchedule = [...todaysActiveJobs].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).slice(0, 4);

  const monday = startOfWeek(today);
  const weekEarnings = WEEKDAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const value = jobs
      .filter((j) => j.status === "completed" && j.scheduled_at && sameDay(new Date(j.scheduled_at), d))
      .reduce((sum, j) => sum + estimateJobPrice(j, servicesById), 0);
    return { day: label, value };
  });
  const weekTotal = weekEarnings.reduce((sum, d) => sum + d.value, 0);

  const pipelineQuotes = quotes.filter((q) => q.status === "sent");
  const pipelineValue = pipelineQuotes.reduce((sum, q) => sum + quoteAmount(q), 0);
  const recentQuotes = quotes.slice(0, 3);

  const outstandingInvoices = invoices.filter((i) => i.status === "unpaid" || i.status === "overdue");
  const outstandingTotal = outstandingInvoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const avgTicket = invoices.length ? invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0) / invoices.length : null;
  const outstandingList = outstandingInvoices.slice(0, 3);

  const kpi = {
    revenue: { Icon: DollarSign, label: "Today's Revenue", value: money(todaysRevenue), sub: `${todaysCompleted} job${todaysCompleted === 1 ? "" : "s"} completed`, hue: "emerald", nav: "schedule" },
    jobs: { Icon: Briefcase, label: "Today's Jobs", value: String(todaysActiveJobs.length), sub: todaysActiveJobs.length === 0 ? "No jobs today" : todaysRemaining > 0 ? `${todaysRemaining} remaining` : "All done for today", hue: "blue", nav: "schedule" },
    customers: { Icon: Users, label: "Customers", value: String(customersCount), sub: newCustomersThisMonth > 0 ? `+${newCustomersThisMonth} this month` : "No new customers this month", hue: "violet", nav: "customers" },
    pipeline: { Icon: TrendingUp, label: "Pipeline Value", value: money(pipelineValue), sub: `${pipelineQuotes.length} open quote${pipelineQuotes.length === 1 ? "" : "s"}`, hue: "amber", nav: "quote" },
    outstanding: { Icon: AlertCircle, label: "Outstanding", value: money(outstandingTotal), sub: `${outstandingInvoices.length} unpaid invoice${outstandingInvoices.length === 1 ? "" : "s"}`, hue: "coral", nav: "invoices" },
    avgTicket: { Icon: Receipt, label: "Avg. Ticket", value: avgTicket == null ? "—" : money(avgTicket), sub: `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`, hue: "blue", nav: "invoices" },
  };

  const insights = [];
  if (outstandingInvoices.length > 0) {
    insights.push({ text: `${outstandingInvoices.length} invoice${outstandingInvoices.length === 1 ? "" : "s"} unpaid, totaling ${money(outstandingTotal)}.`, action: "Send reminders", nav: "invoices" });
  }
  if (pipelineQuotes.length > 0) {
    insights.push({ text: `${pipelineQuotes.length} quote${pipelineQuotes.length === 1 ? "" : "s"} in your pipeline (${money(pipelineValue)}) waiting on a response.`, action: "Review pipeline", nav: "quote" });
  }
  if (insights.length === 0) {
    insights.push({ text: "You're all caught up — no unpaid invoices or pending quotes.", action: null, nav: null });
  }

  function fireFab() {
    document.getElementById("insights")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPulse(true);
    setTimeout(() => setPulse(false), 1200);
  }

  async function completeFollowUp(f) {
    setFollowUps((list) => list.filter((x) => x.id !== f.id));
    const { error: updateError } = await supabase.from("follow_ups").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", f.id);
    if (updateError) console.error(updateError);
  }
  async function quickAddFollowUp(note, dueDate, customerId) {
    if (!businessId || !note.trim()) return;
    const { data, error: insertError } = await supabase
      .from("follow_ups")
      .insert({ business_id: businessId, note: note.trim(), due_date: dueDate || todayIso, customer_ids: customerId ? [customerId] : [] })
      .select()
      .single();
    if (insertError) { console.error(insertError); return; }
    setFollowUps((list) => [...list, data].sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")));
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      @media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr !important; } }`}</style>

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
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 88, position: "relative" }}>
        <HeaderStaggered editMode={editMode} setEditMode={setEditMode} businessId={businessId} businessName={businessName} businessLogoUrl={businessLogoUrl} onNavigate={onNavigate} dueFollowUps={bellFollowUps} />

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          {loading ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: P.textMuted, fontSize: 13.5 }}>Loading dashboard…</div>
          ) : error ? (
            <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, color: P.danger, fontSize: 13 }}>{error}</div>
          ) : (
            <>
              <BentoGrid kpi={kpi} earnings={weekEarnings} onNavigate={onNavigate} />
              <ProfitBanner editMode={editMode} visible={visible.profitBanner} onToggle={() => toggle("profitBanner")} jobsToday={todaysCompleted} revenueToday={todaysRevenue} />

              <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: P.textPrimary }}>Pinned Apps</span>
                  <button onClick={() => setEditMode(true)} style={{ background: "transparent", border: "none", color: P.accent, cursor: "pointer" }}><Pencil size={14} /></button>
                </div>
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                  {PINNED.map((p) => (
                    <div key={p.id} onClick={() => onNavigate(p.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <div style={{ width: 52, height: 52, borderRadius: "50%", border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}><p.Icon size={20} color={P.textSecondary} /></div>
                      <span style={{ fontSize: 11.5, color: P.textSecondary }}>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Section id="insights" title="Atlas AI — today's insights" editMode={editMode} visible={visible.insights} onToggle={() => toggle("insights")} pulse={pulse}>
                {insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 18px", borderBottom: i < insights.length - 1 ? `1px solid ${P.border}` : "none" }}>
                    <span style={{ fontSize: 13.5, color: P.textSecondary, lineHeight: 1.5 }}>{ins.text}</span>
                    {ins.action && <button onClick={() => onNavigate(ins.nav)} style={{ flexShrink: 0, background: "transparent", border: "none", color: P.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>{ins.action} <ArrowUpRight size={12} /></button>}
                  </div>
                ))}
              </Section>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 16 }} className="dashboard-grid">
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Section id="schedule" title="Today's schedule" action="View schedule" onAction={() => onNavigate("schedule")} editMode={editMode} visible={visible.schedule} onToggle={() => toggle("schedule")}>
                    {todaysSchedule.length === 0 ? (
                      <div style={{ padding: "18px", fontSize: 13, color: P.textMuted, textAlign: "center" }}>No jobs scheduled today</div>
                    ) : todaysSchedule.map((job, i) => (
                      <div key={job.id} onClick={() => onNavigate("customers", { customerId: job.customer_id })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: i < todaysSchedule.length - 1 ? `1px solid ${P.border}` : "none", cursor: "pointer" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS[job.status] || P.textMuted, flexShrink: 0 }} />
                        <div style={{ fontSize: 12.5, color: P.textMuted, width: 68, flexShrink: 0 }}>{formatTime(job.scheduled_at)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{job.customers?.name || "No customer"}</div>
                          <div style={{ fontSize: 12, color: P.textMuted }}>
                            {job.vehicles?.label || "No vehicle"} · {(job.service_ids || []).map((id) => servicesById[id]?.name).filter(Boolean).join(", ") || "No services"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </Section>
                  <Section id="quotes" title="Recent quotes" action="View all" onAction={() => onNavigate("quote")} editMode={editMode} visible={visible.quotes} onToggle={() => toggle("quotes")}>
                    {recentQuotes.length === 0 ? (
                      <div style={{ padding: "18px", fontSize: 13, color: P.textMuted, textAlign: "center" }}>No quotes yet</div>
                    ) : recentQuotes.map((q, i) => (
                      <div key={q.id} onClick={() => onNavigate("customers", { customerId: q.customer_id })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 18px", borderBottom: i < recentQuotes.length - 1 ? `1px solid ${P.border}` : "none", cursor: "pointer" }}>
                        <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{q.customers?.name || "No customer"}</div><div style={{ fontSize: 12, color: P.textMuted }}>{quoteVehicleLabel(q, vehiclesById) || "No vehicle"}</div></div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{money(quoteAmount(q))}</div><div style={{ fontSize: 11.5, color: P.textMuted }}>{capitalize(q.status)}</div></div>
                      </div>
                    ))}
                  </Section>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Section id="chart" title="Earnings this week" editMode={editMode} visible={visible.chart} onToggle={() => toggle("chart")}>
                    <div style={{ padding: "14px 10px 6px" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: P.textPrimary, padding: "0 8px 10px" }}>{money(weekTotal)}</div>
                      <div style={{ width: "100%", height: 130 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={weekEarnings}><Bar dataKey="value" fill={P.accent} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                    </div>
                  </Section>
                  <Section id="invoices" title="Outstanding invoices" action="View all" onAction={() => onNavigate("invoices")} editMode={editMode} visible={visible.invoices} onToggle={() => toggle("invoices")}>
                    {outstandingList.length === 0 ? (
                      <div style={{ padding: "18px", fontSize: 13, color: P.textMuted, textAlign: "center" }}>No outstanding invoices</div>
                    ) : outstandingList.map((inv, i) => {
                      const daysOverdue = inv.due_date ? Math.floor((today - parseDate(inv.due_date)) / 86400000) : 0;
                      return (
                        <div key={inv.id} onClick={() => onNavigate("customers", { customerId: inv.customer_id })} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 18px", borderBottom: i < outstandingList.length - 1 ? `1px solid ${P.border}` : "none", cursor: "pointer" }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{inv.customers?.name || "No customer"}</div>
                          <div style={{ textAlign: "right" }}><div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{money(inv.amount)}</div><div style={{ fontSize: 11.5, color: daysOverdue > 0 ? P.danger : P.textMuted }}>{daysOverdue > 0 ? `${daysOverdue}d overdue` : "Due soon"}</div></div>
                        </div>
                      );
                    })}
                  </Section>
                  <Section id="followups" title="Follow-ups" action="View all" onAction={() => onNavigate("followups")} editMode={editMode} visible={visible.followups} onToggle={() => toggle("followups")}>
                    <FollowUpsQuickAdd customers={customersList} onAdd={quickAddFollowUp} />
                    <FollowUpsList items={dueFollowUps.length ? dueFollowUps : upcomingFollowUps} customersById={customersById} onComplete={completeFollowUp} />
                  </Section>
                </div>
              </div>
            </>
          )}
        </div>

        {/* AI FAB — customize-linked, dismissible like any other section */}
        {visible.aiFab && (
          <div style={{ position: "fixed", bottom: 100, right: 28, zIndex: 25 }}>
            {editMode && (
              <button onClick={() => toggle("aiFab")} style={{ position: "absolute", top: -8, left: -8, width: 20, height: 20, borderRadius: "50%", background: P.danger, border: `2px solid ${P.bg}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 26 }}>
                <X size={11} color="#fff" />
              </button>
            )}
            <button onClick={fireFab} style={{ width: 54, height: 54, borderRadius: "50%", background: `linear-gradient(135deg, ${P.accent}, ${P.secondary})`, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Sparkles size={22} color={P.bg} />
            </button>
          </div>
        )}
        {editMode && !visible.aiFab && (
          <button onClick={() => toggle("aiFab")} style={{ position: "fixed", bottom: 100, right: 28, zIndex: 25, display: "flex", alignItems: "center", gap: 6, background: P.surface, border: `1px dashed ${P.border}`, borderRadius: 20, padding: "8px 14px", color: P.textMuted, fontSize: 12, cursor: "pointer" }}>
            <Eye size={13} /> Show AI button
          </button>
        )}
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
    </div>
  );
}
