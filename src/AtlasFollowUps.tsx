import { useState, useEffect, useRef } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Plus,
  Sparkles, MoreHorizontal, Pencil, Camera, X, Check, Loader2,
  ListChecks, Trash2, AlertCircle,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { resizeImageToDataUrl, useLiveClock, formatDateTime, parseDate, formatDate } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};

const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};
const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 };

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-followups";
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
  { id: "invoices", label: "Invoices", Icon: Receipt }, { id: "settings", label: "Settings", Icon: Settings },
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
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function bucketOf(f, today) {
  if (f.status === "done") return "done";
  if (!f.due_date) return "noDate";
  if (f.due_date < today) return "overdue";
  if (f.due_date === today) return "today";
  return "upcoming";
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

function StatCard({ label, value, sub, tone }) {
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || P.textPrimary, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: P.textSecondary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/* ---------------------------------- Add/Edit Follow-up modal ---------------------------------- */

function FollowUpModal({ businessId, customers, followUp, onClose, onSaved }) {
  const isEdit = !!followUp;
  const [note, setNote] = useState(followUp?.note || "");
  const [dueDate, setDueDate] = useState(followUp?.due_date || todayStr());
  const [customerIds, setCustomerIds] = useState(followUp?.customer_ids || []);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredCustomers = search.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : customers;

  function toggleCustomer(id) {
    setCustomerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!note.trim()) { setError("Enter what you need to follow up on."); return; }
    setSaving(true);
    setError("");
    const payload = { note: note.trim(), due_date: dueDate || null, customer_ids: customerIds };
    const query = isEdit
      ? supabase.from("follow_ups").update(payload).eq("id", followUp.id)
      : supabase.from("follow_ups").insert({ business_id: businessId, ...payload });
    const { data, error: saveError } = await query.select().single();
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    onSaved(data);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(460px, calc(100vw - 32px))", maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: P.bg, border: `1px solid ${P.border}`, borderRadius: 16, zIndex: 51, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>{isEdit ? "Edit follow-up" : "Add follow-up"}</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12.5, color: P.danger }}>{error}</div>}
          <div>
            <label style={labelStyle}>What do you need to follow up on?</label>
            <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Call these customers back about the spring promo" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div>
            <label style={labelStyle}>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
          <div>
            <label style={labelStyle}>Customers {customerIds.length > 0 ? `(${customerIds.length} selected)` : "(optional — pick one or several)"}</label>
            {customers.length > 0 && (
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers…" style={{ ...inputStyle, marginBottom: 8 }} />
            )}
            <div style={{ maxHeight: 190, overflowY: "auto", border: `1px solid ${P.border}`, borderRadius: 10, padding: 6 }}>
              {customers.length === 0 ? (
                <div style={{ padding: "10px 6px", fontSize: 12, color: P.textMuted }}>No customers yet.</div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ padding: "10px 6px", fontSize: 12, color: P.textMuted }}>No matches.</div>
              ) : (
                filteredCustomers.map((c) => {
                  const checked = customerIds.includes(c.id);
                  return (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 7, cursor: "pointer", background: checked ? P.surfaceHover : "transparent" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCustomer(c.id)} style={{ accentColor: P.accent }} />
                      <span style={{ fontSize: 13, color: P.textPrimary }}>{c.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <button type="submit" disabled={saving} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.85 : 1 }}>
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : isEdit ? "Save changes" : "Add follow-up"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ---------------------------------- row + group ---------------------------------- */

function FollowUpRow({ f, customersById, onToggle, onEdit, onDelete }) {
  const overdue = f.status === "pending" && f.due_date && f.due_date < todayStr();
  const names = (f.customer_ids || []).map((id) => customersById[id]?.name).filter(Boolean);
  const namesLabel = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ");
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px", borderBottom: `1px solid ${P.border}` }}>
      <button
        onClick={() => onToggle(f)}
        title={f.status === "done" ? "Mark as not done" : "Mark as done"}
        style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${f.status === "done" ? P.accent : P.border}`, background: f.status === "done" ? P.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, marginTop: 1, padding: 0 }}
      >
        {f.status === "done" && <Check size={13} color={P.bg} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: f.status === "done" ? P.textMuted : P.textPrimary, textDecoration: f.status === "done" ? "line-through" : "none", lineHeight: 1.4 }}>{f.note}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {namesLabel && <span style={{ fontSize: 11.5, color: P.textSecondary }}>{namesLabel}</span>}
          {f.due_date && (
            <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? P.danger : P.textMuted }}>
              {overdue && <AlertCircle size={10} style={{ verticalAlign: -1, marginRight: 3 }} />}
              {formatDate(f.due_date)}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onEdit(f)} title="Edit" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", flexShrink: 0 }}><Pencil size={14} /></button>
      <button onClick={() => onDelete(f.id)} title="Delete" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", flexShrink: 0 }}><Trash2 size={14} /></button>
    </div>
  );
}

function Group({ title, items, customersById, tone, onToggle, onEdit, onDelete }) {
  if (items.length === 0) return null;
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${P.border}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: tone || P.textMuted }}>
        {title} <span style={{ color: P.textMuted, fontWeight: 600 }}>({items.length})</span>
      </div>
      {items.map((f) => <FollowUpRow key={f.id} f={f} customersById={customersById} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasFollowUps({ onNavigate, currentPage = "followups" }) {
  const { businessId, businessName, businessLogoUrl, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [followUps, setFollowUps] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      const [followUpsResult, customersResult] = await Promise.all([
        supabase.from("follow_ups").select("*").eq("business_id", businessId).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("customers").select("id, name").eq("business_id", businessId).order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      if (followUpsResult.error) setDataError(followUpsResult.error.message);
      else setFollowUps(followUpsResult.data || []);
      setCustomers(customersResult.data || []);
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && loadingData);
  const error = bizError || dataError;
  const customersById = Object.fromEntries(customers.map((c) => [c.id, c]));

  async function toggle(f) {
    const nextStatus = f.status === "done" ? "pending" : "done";
    setFollowUps((list) => list.map((x) => (x.id === f.id ? { ...x, status: nextStatus, completed_at: nextStatus === "done" ? new Date().toISOString() : null } : x)));
    const { error: updateError } = await supabase.from("follow_ups").update({ status: nextStatus, completed_at: nextStatus === "done" ? new Date().toISOString() : null }).eq("id", f.id);
    if (updateError) setDataError(updateError.message);
  }
  async function remove(id) {
    setFollowUps((list) => list.filter((f) => f.id !== id));
    const { error: deleteError } = await supabase.from("follow_ups").delete().eq("id", id);
    if (deleteError) setDataError(deleteError.message);
  }
  function handleSaved(f) {
    setFollowUps((list) => (list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [...list, f]));
    setAddOpen(false);
    setEditingFollowUp(null);
  }

  const today = todayStr();
  const buckets = { overdue: [], today: [], upcoming: [], noDate: [], done: [] };
  for (const f of followUps) buckets[bucketOf(f, today)].push(f);
  const openCount = followUps.filter((f) => f.status === "pending").length;

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
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Follow-ups <span style={{ color: P.textMuted }}>· {openCount} open · {formatDateTime(now)}</span></span>
            </div>
          </div>
          <button onClick={() => setAddOpen(true)} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6, flexShrink: 0 }}><Plus size={14} /> Add Follow-up</button>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            <StatCard label="Overdue" value={buckets.overdue.length} tone={buckets.overdue.length > 0 ? P.danger : undefined} />
            <StatCard label="Due Today" value={buckets.today.length} tone={buckets.today.length > 0 ? P.accent : undefined} />
            <StatCard label="Open" value={openCount} sub="total pending" />
          </div>

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading follow-ups…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : followUps.length === 0 ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted }}>
              No follow-ups yet — add one to get reminded when it's due.
            </div>
          ) : (
            <>
              <Group title="Overdue" items={buckets.overdue} customersById={customersById} tone={P.danger} onToggle={toggle} onEdit={setEditingFollowUp} onDelete={remove} />
              <Group title="Today" items={buckets.today} customersById={customersById} tone={P.accent} onToggle={toggle} onEdit={setEditingFollowUp} onDelete={remove} />
              <Group title="Upcoming" items={buckets.upcoming} customersById={customersById} onToggle={toggle} onEdit={setEditingFollowUp} onDelete={remove} />
              <Group title="No due date" items={buckets.noDate} customersById={customersById} onToggle={toggle} onEdit={setEditingFollowUp} onDelete={remove} />

              {buckets.done.length > 0 && (
                <div>
                  <button onClick={() => setShowDone((v) => !v)} style={{ background: "transparent", border: "none", color: P.textMuted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 0", marginBottom: showDone ? 10 : 0 }}>
                    {showDone ? "Hide" : "Show"} completed ({buckets.done.length})
                  </button>
                  {showDone && <Group title="Completed" items={buckets.done} customersById={customersById} onToggle={toggle} onEdit={setEditingFollowUp} onDelete={remove} />}
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
              <button key={p.id} onClick={() => { onNavigate(p.id); setMoreOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 9, border: "none", background: currentPage === p.id ? P.surfaceHover : "transparent", color: currentPage === p.id ? P.textPrimary : P.textSecondary, cursor: "pointer", textAlign: "left" }}>
                <p.Icon size={16} color={currentPage === p.id ? P.accent : P.textMuted} />
                <span style={{ fontSize: 13.5, fontWeight: currentPage === p.id ? 600 : 500 }}>{p.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {(addOpen || editingFollowUp) && (
        <FollowUpModal
          businessId={businessId}
          customers={customers}
          followUp={editingFollowUp}
          onClose={() => { setAddOpen(false); setEditingFollowUp(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
