import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutGrid, Calendar, Users, Car, Receipt, Settings, Sparkles,
  MoreHorizontal, Pencil, Camera, Plus, ChevronLeft, ChevronRight,
  X, Eye, EyeOff, Loader2, ListChecks, Check, Copy, MessageSquare, Trash2, Navigation,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { useBusinessId } from "./useBusinessId";
import { resizeImageToDataUrl, useLiveClock, formatDateTime, mergeBusinessJsonb, directionsUrl, readDraft, clearDraft, useDraftAutosave, usHolidayName } from "./lib";

const P = {
  bg: "#06100C", bgTop: "#0B1813", surface: "#0F1B15", surfaceHover: "#132018",
  border: "#1E2E25", textPrimary: "#EDF6F1", textSecondary: "#92AA9D", textMuted: "#566B5E",
  accent: "#18D97A", accentHover: "#35E890", secondary: "#FF7A63",
  accentSoft: "rgba(24,217,122,0.14)", secondarySoft: "rgba(255,122,99,0.14)", danger: "#FF6B5E",
};
const STATUS = { scheduled: "#4C8DFF", in_progress: "#F5A623", completed: P.accent, cancelled: P.danger };
const STATUS_LABEL = { scheduled: "Scheduled", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inputStyle = {
  width: "100%", background: "transparent", border: `1px solid ${P.border}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 13.5, color: P.textPrimary, outline: "none", boxSizing: "border-box",
};
const labelStyle = { display: "block", fontSize: 12.5, fontWeight: 500, color: P.textSecondary, marginBottom: 6 };

function AtlasMark({ size = 24 }) {
  const gid = "atlas-globe-schedule";
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

function money(n) { return `$${Math.round(n).toLocaleString()}`; }
function sameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function sameMonth(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function toInputDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function toInputTime(d) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function formatTime(iso) { return iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"; }
function jobDate(job) { return job.scheduled_at ? new Date(job.scheduled_at) : null; }

function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const gridStart = new Date(year, month, 1 - new Date(year, month, 1).getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { date: d, inMonth: d.getMonth() === month };
  });
}

function estimateJobPrice(job, servicesById) {
  const ids = Array.isArray(job.service_ids) ? job.service_ids : [];
  if (ids.length === 0) return null;
  const isSuv = job.vehicles?.size_class === "suv_truck_van";
  let total = 0;
  let known = false;
  for (const id of ids) {
    const svc = servicesById[id];
    const price = isSuv ? (svc?.price_suv_low ?? svc?.price_car_low) : svc?.price_car_low;
    if (price != null) { total += Number(price); known = true; }
  }
  return known ? total : null;
}

function jobServiceNames(job, servicesById) {
  const ids = Array.isArray(job.service_ids) ? job.service_ids : [];
  const names = ids.map((id) => servicesById[id]?.name).filter(Boolean);
  return names.length ? names.join(", ") : "No services selected";
}

function initials(name) { return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(); }

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

function VisibilityToggle({ editMode, visible, onToggle }) {
  if (editMode) {
    return (
      <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 5, background: visible ? "transparent" : P.accentSoft, border: `1px solid ${visible ? P.border : P.accent}`, borderRadius: 7, padding: "4px 9px", color: visible ? P.textMuted : P.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
        {visible ? <EyeOff size={11} /> : <Eye size={11} />} {visible ? "Hide" : "Show"}
      </button>
    );
  }
  return (
    <button onClick={onToggle} title="Hide this" style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", padding: 3, display: "flex" }}>
      <X size={13} />
    </button>
  );
}

function HiddenGhost({ label, onToggle }) {
  return (
    <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: `1px dashed ${P.border}`, borderRadius: 12, padding: "12px 16px", color: P.textMuted, fontSize: 12, cursor: "pointer" }}>
      <Eye size={13} /> {label} — click to show it again
    </button>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {Object.entries(STATUS).map(([k, color]) => (
        <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: P.textMuted }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} /> {STATUS_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------- Month view (drag to reschedule) ---------------------------------- */

function MonthView({ jobs, viewMonth, moveJob, previewDate, setPreviewDate, showHolidays }) {
  const [dragId, setDragId] = useState(null);
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const today = new Date();
  // The native HTML5 drag-and-drop API (`draggable`) only really works with
  // a mouse — on a touchscreen it doesn't enable working drag-to-reschedule,
  // but it can still make WebKit treat a tap on the element as the start of
  // a drag gesture rather than a plain tap, which is what was still eating
  // taps on job chips even after removing their own onClick. Only mark chips
  // draggable on devices with a mouse-like (fine) pointer.
  const supportsDrag = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", marginBottom: 6 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: P.textMuted, padding: "6px 0" }}>{w}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
        {cells.map((c, i) => {
          const dayJobs = jobs.filter((j) => sameDay(jobDate(j), c.date));
          const isToday = sameDay(c.date, today);
          const isPreviewed = previewDate && sameDay(c.date, previewDate);
          const holiday = showHolidays ? usHolidayName(c.date) : null;
          return (
            <div
              key={i}
              onDragOver={(e) => c.inMonth && e.preventDefault()}
              onDrop={() => { if (c.inMonth && dragId != null) { moveJob(dragId, c.date); setDragId(null); } }}
              onClick={() => c.inMonth && setPreviewDate(isPreviewed ? null : c.date)}
              style={{
                minHeight: 78, minWidth: 0, borderRadius: 10, padding: 6, cursor: c.inMonth ? "pointer" : "default",
                background: isPreviewed ? P.accentSoft : P.surface,
                border: `1px solid ${isPreviewed ? P.accent : P.border}`,
                boxShadow: isPreviewed ? `0 0 0 2px ${P.accentSoft}` : "none",
                opacity: c.inMonth ? 1 : 0.35, overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: isPreviewed ? 800 : 600, color: isPreviewed ? P.accent : P.textSecondary }}>{c.date.getDate()}</span>
                {isToday && <span title="Today" style={{ width: 4, height: 4, borderRadius: "50%", background: P.accent, flexShrink: 0 }} />}
                {holiday && <span title={holiday} style={{ fontSize: 9, flexShrink: 0 }}>🎉</span>}
              </div>
              {holiday && <div style={{ fontSize: 8.5, fontWeight: 600, color: P.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>{holiday}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                {dayJobs.slice(0, 3).map((j) => (
                  <div
                    key={j.id}
                    draggable={supportsDrag}
                    onDragStart={supportsDrag ? () => setDragId(j.id) : undefined}
                    title={`${formatTime(j.scheduled_at)} · ${j.customers?.name || "No customer"}`}
                    style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, background: `${STATUS[j.status]}1F`, borderRadius: 5, padding: "2px 4px", cursor: "pointer" }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS[j.status], flexShrink: 0 }} />
                    <span style={{ fontSize: 9.5, color: P.textSecondary, minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(j.customers?.name || "No customer").split(" ")[0]}</span>
                  </div>
                ))}
                {dayJobs.length > 3 && <span style={{ fontSize: 9, color: P.textMuted, paddingLeft: 2 }}>+{dayJobs.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11.5, color: P.textMuted, marginTop: 10, fontStyle: "italic" }}>Click a day to preview it, or hold and drag a job to reschedule.</p>
    </div>
  );
}

function HolidayBanner({ name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: P.secondarySoft, border: `1px solid ${P.secondary}55`, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, color: P.secondary }}>
      🎉 {name}
    </div>
  );
}

function DayPreview({ date, jobs, servicesById, openFullDay, onClose, onAddJob, onEditJob, showHolidays }) {
  const dayJobs = jobs.filter((j) => sameDay(jobDate(j), date)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const dateLabel = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const holiday = showHolidays ? usHolidayName(date) : null;
  return (
    <div style={{ background: P.surface, border: `1px solid ${P.accent}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${P.border}` }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: P.textPrimary }}>{dateLabel}{holiday ? ` · 🎉 ${holiday}` : ""}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={openFullDay} style={{ background: "transparent", border: "none", color: P.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Open full day →</button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={15} /></button>
        </div>
      </div>

      {dayJobs.length === 0 ? (
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 12.5, color: P.textMuted, margin: "0 0 10px" }}>No jobs on this day yet.</p>
          <button onClick={() => onAddJob(date)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: P.accentSoft, border: `1px solid ${P.accent}`, color: P.accent, borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={13} /> Add job
          </button>
        </div>
      ) : (
        <div>
          {dayJobs.map((j, i) => (
            <div key={j.id} onClick={() => onEditJob?.(j)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: i < dayJobs.length - 1 ? `1px solid ${P.border}` : "none", cursor: onEditJob ? "pointer" : "default" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS[j.status], flexShrink: 0 }} />
              <div style={{ fontSize: 11.5, color: P.textMuted, width: 78, flexShrink: 0 }}>{formatTime(j.scheduled_at)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: P.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.customers?.name || "No customer"}</div>
                <div style={{ fontSize: 11, color: P.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.vehicles?.label || "No vehicle"} · {jobServiceNames(j, servicesById)}</div>
              </div>
              {j.customers?.address && (
                <a
                  href={directionsUrl(j.customers.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`Directions to ${j.customers.address}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: `1px solid ${P.border}`, color: P.accent, flexShrink: 0, textDecoration: "none" }}
                >
                  <Navigation size={12} />
                </a>
              )}
              {(() => { const est = estimateJobPrice(j, servicesById); return <div style={{ fontSize: 12.5, fontWeight: 700, color: est != null ? P.textPrimary : P.textMuted, flexShrink: 0 }}>{est != null ? money(est) : "—"}</div>; })()}
            </div>
          ))}
          <div style={{ padding: "10px 16px" }}>
            <button onClick={() => onAddJob(date)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px dashed ${P.border}`, color: P.textMuted, borderRadius: 8, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={12} /> Add another job
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Week view ---------------------------------- */

function WeekView({ jobs, selectedDate, goToDate }) {
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(startOfWeek); d.setDate(d.getDate() + i); return d; });
  const today = new Date();

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${weekDays.length}, minmax(0,1fr))`, gap: 8 }}>
      {weekDays.map((d) => {
        const dayJobs = jobs.filter((j) => sameDay(jobDate(j), d)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
        const isToday = sameDay(d, today);
        return (
          <div key={d.toISOString()} onClick={() => goToDate(d)} style={{ cursor: "pointer", minWidth: 0, overflow: "hidden", background: isToday ? P.accentSoft : P.surface, border: `1px solid ${isToday ? P.accent : P.border}`, borderRadius: 10, padding: 8, minHeight: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? P.accent : P.textSecondary, marginBottom: 6, textAlign: "center" }}>
              {WEEKDAYS[d.getDay()]} {d.getDate()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              {dayJobs.map((j) => (
                <div key={j.id} style={{ background: `${STATUS[j.status]}1F`, borderRadius: 6, padding: "4px 5px", minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 9, color: P.textMuted }}>{formatTime(j.scheduled_at)}</div>
                  <div style={{ fontSize: 10, color: P.textPrimary, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.customers?.name || "No customer"}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Day view ---------------------------------- */

function DayView({ jobs, selectedDate, servicesById, onEditJob, showHolidays }) {
  const dayJobs = jobs.filter((j) => sameDay(jobDate(j), selectedDate)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const holiday = showHolidays ? usHolidayName(selectedDate) : null;

  if (dayJobs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {holiday && <HolidayBanner name={holiday} />}
        <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center" }}>
          <Calendar size={22} color={P.textMuted} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: P.textPrimary }}>No jobs on {dateLabel}</div>
          <div style={{ fontSize: 12.5, color: P.textMuted, marginTop: 4 }}>Enjoy the day, or schedule a new job.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {holiday && <HolidayBanner name={holiday} />}
      {dayJobs.map((j) => {
        const est = estimateJobPrice(j, servicesById);
        return (
          <div key={j.id} onClick={() => onEditJob?.(j)} style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, cursor: onEditJob ? "pointer" : "default" }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: STATUS[j.status], flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: P.textMuted, width: 84, flexShrink: 0 }}>{formatTime(j.scheduled_at)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: P.textPrimary }}>{j.customers?.name || "No customer"}</div>
              <div style={{ fontSize: 12, color: P.textMuted }}>{j.vehicles?.label || "No vehicle"} · {jobServiceNames(j, servicesById)}</div>
            </div>
            {j.customers?.address && (
              <a
                href={directionsUrl(j.customers.address)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Directions to ${j.customers.address}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${P.border}`, color: P.accent, flexShrink: 0, textDecoration: "none" }}
              >
                <Navigation size={14} />
              </a>
            )}
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: `${STATUS[j.status]}22`, color: STATUS[j.status], flexShrink: 0 }}>{STATUS_LABEL[j.status]}</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: est != null ? P.textPrimary : P.textMuted, width: 64, textAlign: "right", flexShrink: 0 }}>{est != null ? money(est) : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Add Job modal ---------------------------------- */

const DEFAULT_BOOKING_SCRIPT =
  "Hi {customer_first}, this confirms your appointment with {business} for {vehicle} on {date} at {time}. See you then!";

function fillJobScript(template, ctx) {
  return (template || "")
    .replace(/\{customer_first\}/g, ctx.customerFirst || "there")
    .replace(/\{vehicle\}/g, ctx.vehicle || "your vehicle")
    .replace(/\{date\}/g, ctx.date || "")
    .replace(/\{time\}/g, ctx.time || "")
    .replace(/\{business\}/g, ctx.business || "us");
}

// There's no per-service duration data to work with, so "overlap" is
// approximated as another active job within an hour of the proposed time —
// close enough to catch an accidental double-booking without needing real
// duration tracking. This only warns; it never blocks the save, since a
// two-person crew can legitimately run two jobs at once.
const OVERLAP_BUFFER_MINUTES = 60;
function findConflict(scheduledAtIso, jobs, excludeId) {
  if (!scheduledAtIso) return null;
  const t = new Date(scheduledAtIso).getTime();
  const bufferMs = OVERLAP_BUFFER_MINUTES * 60000;
  return jobs.find((j) => j.id !== excludeId && j.status !== "cancelled" && j.scheduled_at && Math.abs(new Date(j.scheduled_at).getTime() - t) < bufferMs) || null;
}

function formatJobDateTime(d) {
  return {
    date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function AddJobModal({ businessId, businessName, customers, vehicles, services, jobs, initialDate, job, onClose, onAdded, onDelete, onVehicleAdded }) {
  const isEdit = !!job;
  const [customerId, setCustomerId] = useState(job?.customer_id || "");
  const [vehicleId, setVehicleId] = useState(job?.vehicle_id || "");
  const [serviceIds, setServiceIds] = useState(job?.service_ids || []);
  const [date, setDate] = useState(toInputDate(job ? new Date(job.scheduled_at) : (initialDate || new Date())));
  const [time, setTime] = useState(job ? toInputTime(new Date(job.scheduled_at)) : "09:00");
  const [status, setStatus] = useState(job?.status || "scheduled");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // A customer with no vehicles on file left this form with nowhere to go —
  // the Vehicle dropdown just showed "No vehicle" and there was no way to
  // add one without abandoning the job and going to the Vehicles page. This
  // lets a vehicle get added right here, inline, without leaving the form.
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicleLabel, setNewVehicleLabel] = useState("");
  const [newVehicleType, setNewVehicleType] = useState("Car");
  const [newVehicleSize, setNewVehicleSize] = useState("car");
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState("");

  // Set once the job is created — switches this modal from the booking form
  // to a "here's what the customer gets" confirmation-text preview instead
  // of just closing, since sending that text is still a manual step today.
  const [createdJob, setCreatedJob] = useState(null);
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);

  // Autosave-draft safety net for a brand-new job (an edit already has real,
  // saved data, so it's skipped there) — a crash mid-entry in the field
  // (phone dies, a call interrupts) doesn't lose it outright. Restored once
  // on mount; cleared on a successful save or an explicit close/discard.
  const draftKey = businessId ? `job-new-${businessId}` : null;
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (isEdit || !draftKey) return;
    const draft = readDraft(draftKey);
    if (!draft?.value) return;
    const v = draft.value;
    if (v.customerId) setCustomerId(v.customerId);
    if (v.vehicleId) setVehicleId(v.vehicleId);
    if (v.serviceIds?.length) setServiceIds(v.serviceIds);
    if (v.date) setDate(v.date);
    if (v.time) setTime(v.time);
    if (v.status) setStatus(v.status);
    setDraftRestored(true);
    // Runs once on mount only — restoring a draft shouldn't re-trigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useDraftAutosave(draftKey, { customerId, vehicleId, serviceIds, date, time, status }, !isEdit && !!draftKey && !createdJob);

  function discardDraft() {
    if (draftKey) clearDraft(draftKey);
    setDraftRestored(false);
  }
  function handleCloseModal() {
    if (!isEdit && !createdJob) discardDraft();
    onClose();
  }

  const vehiclesForCustomer = customerId ? vehicles.filter((v) => v.customer_id === customerId) : vehicles;
  const categories = [...new Set(services.map((s) => s.category))];

  const conflict = useMemo(() => {
    if (!date || !time || !jobs) return null;
    const iso = new Date(`${date}T${time}`).toISOString();
    return findConflict(iso, jobs, job?.id);
  }, [date, time, jobs, job?.id]);

  function toggleService(id) {
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleAddVehicle(e) {
    e.preventDefault();
    if (!newVehicleLabel.trim()) {
      setVehicleError('Enter a description, like "2021 VW ID4".');
      return;
    }
    setSavingVehicle(true);
    setVehicleError("");

    const { data, error: insertError } = await supabase
      .from("vehicles")
      .insert({
        business_id: businessId,
        label: newVehicleLabel.trim(),
        vehicle_type: newVehicleType,
        size_class: newVehicleSize,
        customer_id: customerId || null,
      })
      .select("*, customers(name)")
      .single();

    setSavingVehicle(false);
    if (insertError) {
      setVehicleError(insertError.message);
      return;
    }
    onVehicleAdded?.(data);
    setVehicleId(data.id);
    setAddingVehicle(false);
    setNewVehicleLabel("");
    setNewVehicleType("Car");
    setNewVehicleSize("car");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!date || !time) {
      setError("Pick a date and time.");
      return;
    }
    setSaving(true);
    setError("");

    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    const payload = {
      business_id: businessId,
      customer_id: customerId || null,
      vehicle_id: vehicleId || null,
      service_ids: serviceIds,
      scheduled_at: scheduledAt,
      status,
    };
    const query = isEdit
      ? supabase.from("jobs").update(payload).eq("id", job.id)
      : supabase.from("jobs").insert(payload);
    const { data, error: saveError } = await query
      .select("*, customers(name, phone, address), vehicles(label, size_class)")
      .single();

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onAdded(data);

    if (isEdit) {
      onClose();
      return;
    }

    if (draftKey) clearDraft(draftKey);
    const { date: dLabel, time: tLabel } = formatJobDateTime(new Date(data.scheduled_at));
    setScript(fillJobScript(DEFAULT_BOOKING_SCRIPT, {
      customerFirst: data.customers?.name?.split(" ")[0] || "there",
      vehicle: data.vehicles?.label || "your vehicle",
      date: dLabel,
      time: tLabel,
      business: businessName || "us",
    }));
    setCreatedJob(data);
  }

  async function handleDelete() {
    if (!job) return;
    setDeleting(true);
    await onDelete?.(job.id);
    setDeleting(false);
  }

  function copyScript() {
    navigator.clipboard?.writeText(script).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div onClick={handleCloseModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(460px, calc(100vw - 32px))", maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: P.bg, border: `1px solid ${P.border}`, borderRadius: 16, zIndex: 51, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: P.textPrimary }}>{createdJob ? "Job scheduled" : isEdit ? "Edit job" : "New job"}</span>
          <button onClick={handleCloseModal} style={{ background: "transparent", border: "none", color: P.textMuted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        {!isEdit && !createdJob && draftRestored && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12, color: P.textSecondary, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 9, padding: "8px 11px", marginBottom: 14 }}>
            <span>Restored an unsaved job from earlier.</span>
            <button type="button" onClick={discardDraft} style={{ background: "transparent", border: "none", color: P.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Discard</button>
          </div>
        )}
        {createdJob ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: P.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Check size={20} color={P.accent} />
              </div>
              <p style={{ fontSize: 13, color: P.textSecondary, margin: 0 }}>This is what {createdJob.customers?.name?.split(" ")[0] || "the customer"} would get — sending is still manual for now.</p>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={labelStyle}>Confirmation text preview</label>
                <button type="button" onClick={copyScript} style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: P.accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: P.textPrimary }}>Send automatically</div>
                <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>Needs a texting service connected first — coming soon.</div>
              </div>
              <div title="Not connected yet" style={{ width: 34, height: 20, borderRadius: 20, background: P.border, position: "relative", opacity: 0.5, flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: P.textMuted, position: "absolute", top: 2, left: 2 }} />
              </div>
            </div>

            {createdJob.customers?.phone ? (
              <a
                href={`sms:${createdJob.customers.phone}?body=${encodeURIComponent(script)}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}
              >
                <MessageSquare size={15} /> Text this to {createdJob.customers.name?.split(" ")[0] || "customer"}
              </a>
            ) : (
              <p style={{ fontSize: 12, color: P.textMuted, textAlign: "center", margin: 0, fontStyle: "italic" }}>No phone number on file for this customer — copy the message above to send it another way.</p>
            )}

            <button type="button" onClick={onClose} style={{ background: "transparent", border: `1px solid ${P.border}`, color: P.textSecondary, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Done
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ fontSize: 12.5, color: P.danger }}>{error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Customer</label>
              <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId(""); }} style={inputStyle}>
                <option value="">No customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={labelStyle}>Vehicle</label>
                {!addingVehicle && (
                  <button type="button" onClick={() => setAddingVehicle(true)} style={{ background: "transparent", border: "none", color: P.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", marginBottom: 6 }}>+ Add</button>
                )}
              </div>
              {!addingVehicle && (
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={inputStyle}>
                  <option value="">No vehicle</option>
                  {vehiclesForCustomer.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              )}
            </div>
          </div>

          {addingVehicle && (
            <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {vehicleError && <div style={{ fontSize: 12, color: P.danger }}>{vehicleError}</div>}
              <div>
                <label style={labelStyle}>Description</label>
                <input autoFocus value={newVehicleLabel} onChange={(e) => setNewVehicleLabel(e.target.value)} placeholder="2021 VW ID4" style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Type</label>
                  <select value={newVehicleType} onChange={(e) => setNewVehicleType(e.target.value)} style={inputStyle}>
                    {["Car", "Motorcycle", "Boat", "RV & Trailer", "Aircraft", "Other"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Size class</label>
                  <select value={newVehicleSize} onChange={(e) => setNewVehicleSize(e.target.value)} style={inputStyle}>
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
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          {conflict && (
            <div style={{ fontSize: 12, color: "#F5A623", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 9, padding: "8px 11px" }}>
              ⚠ Also booked around this time: {conflict.customers?.name || "another job"} at {formatTime(conflict.scheduled_at)}. You can still save — just flagging the overlap.
            </div>
          )}

          <div>
            <label style={labelStyle}>Services</label>
            <div style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 200, overflowY: "auto" }}>
              {categories.map((cat) => (
                <div key={cat}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.textMuted, marginBottom: 6 }}>{cat}</div>
                  {services.filter((s) => s.category === cat).map((s) => {
                    const selectedVehicle = vehiclesForCustomer.find((v) => v.id === vehicleId);
                    const isSuv = selectedVehicle?.size_class === "suv_truck_van";
                    const price = isSuv ? (s.price_suv_low ?? s.price_car_low) : s.price_car_low;
                    return (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} style={{ accentColor: P.accent }} />
                        <span style={{ fontSize: 12.5, color: P.textSecondary, flex: 1 }}>{s.name}</span>
                        <span style={{ fontSize: 11.5, color: P.textMuted }}>from ${price}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {isEdit && (
              <button type="button" onClick={handleDelete} disabled={deleting || saving} title="Delete job" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${P.border}`, color: P.danger, borderRadius: 10, padding: "0 14px", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}>
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            )}
            <button type="submit" disabled={saving} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.85 : 1 }}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : isEdit ? "Save changes" : "Create job"}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AtlasSchedule({ onNavigate, currentPage = "schedule" }) {
  const { businessId, businessName, businessLogoUrl, businessUiPrefs, loading: bizLoading, error: bizError } = useBusinessId();
  const now = useLiveClock();
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState("");

  const [view, setView] = useState("month");
  const [viewMonth, setViewMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [previewDate, setPreviewDate] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [visible, setVisible] = useState({ stats: true, ai: true, holidays: true });

  useEffect(() => {
    if (businessUiPrefs?.schedule) setVisible((v) => ({ ...v, ...businessUiPrefs.schedule }));
  }, [businessUiPrefs]);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  function toggleVisible(key) {
    setVisible((v) => {
      const next = { ...v, [key]: !v[key] };
      if (businessId) {
        mergeBusinessJsonb(supabase, businessId, "ui_prefs", { schedule: next }).catch((err) => console.error(err));
      }
      return next;
    });
  }

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function load() {
      setLoadingJobs(true);
      const [jobsResult, customersResult, vehiclesResult, servicesResult] = await Promise.all([
        supabase.from("jobs").select("*, customers(name, phone, address), vehicles(label, size_class)").eq("business_id", businessId).order("scheduled_at", { ascending: true }),
        supabase.from("customers").select("id, name, phone").eq("business_id", businessId).order("name", { ascending: true }),
        supabase.from("vehicles").select("id, label, customer_id, size_class").eq("business_id", businessId).order("label", { ascending: true }),
        supabase.from("services").select("id, name, category, price_car_low, price_suv_low").eq("business_id", businessId).order("sort_order", { ascending: true }),
      ]);

      if (cancelled) return;
      if (jobsResult.error) {
        setJobsError(jobsResult.error.message);
      } else {
        setJobs(jobsResult.data);
      }
      setCustomers(customersResult.data || []);
      setVehicles(vehiclesResult.data || []);
      setServices(servicesResult.data || []);
      setLoadingJobs(false);
    }

    load();
    return () => { cancelled = true; };
  }, [businessId]);

  const loading = bizLoading || (!!businessId && loadingJobs);
  const error = bizError || jobsError;
  const servicesById = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);

  function openAddJob(date) {
    setAddDate(date);
    setAddOpen(true);
  }

  function handleAdded(job) {
    // Handles both a new job and an edit to an existing one — if the id
    // already exists in state this replaces it in place instead of
    // appending a duplicate.
    setJobs((js) => {
      const exists = js.some((j) => j.id === job.id);
      const next = exists ? js.map((j) => (j.id === job.id ? job : j)) : [...js, job];
      return next.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    });
    // For a brand-new job the modal stays open — it switches itself to a
    // confirmation-text preview screen and closes only when dismissed from
    // there. Edits close immediately since there's no "just booked" moment.
  }

  function handleVehicleAdded(vehicle) {
    setVehicles((vs) => [...vs, vehicle].sort((a, b) => a.label.localeCompare(b.label)));
  }

  async function handleDeleteJob(id) {
    const previous = jobs;
    setJobs((js) => js.filter((j) => j.id !== id));
    setEditingJob(null);
    const { error: deleteError } = await supabase.from("jobs").delete().eq("id", id);
    if (deleteError) setJobs(previous);
  }

  async function moveJob(id, newDate) {
    const job = jobs.find((j) => j.id === id);
    if (!job || !job.scheduled_at) return;
    const old = new Date(job.scheduled_at);
    const updated = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), old.getHours(), old.getMinutes());
    const iso = updated.toISOString();
    const conflict = findConflict(iso, jobs, id);
    if (conflict && !window.confirm(`This is close to another job at ${formatTime(conflict.scheduled_at)}${conflict.customers?.name ? ` (${conflict.customers.name})` : ""} that day. Move it here anyway?`)) return;
    const previous = job.scheduled_at;
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, scheduled_at: iso } : j)));
    const { error: updateError } = await supabase.from("jobs").update({ scheduled_at: iso }).eq("id", id);
    if (updateError) {
      setJobs((js) => js.map((j) => (j.id === id ? { ...j, scheduled_at: previous } : j)));
    }
  }

  function goToDate(d) { setSelectedDate(d); setView("day"); setPreviewDate(null); }

  function shiftMonth(delta) { setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1)); }
  function shiftWeek(delta) { setSelectedDate((d) => { const n = new Date(d); n.setDate(n.getDate() + delta * 7); return n; }); }
  function shiftDay(delta) { setSelectedDate((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; }); }

  const periodRevenue = useMemo(() => {
    const active = jobs.filter((j) => j.status !== "cancelled" && j.scheduled_at);
    let scoped;
    if (view === "day") scoped = active.filter((j) => sameDay(jobDate(j), selectedDate));
    else if (view === "week") {
      const start = new Date(selectedDate); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
      scoped = active.filter((j) => { const d = jobDate(j); return d >= start && d <= end; });
    } else {
      scoped = active.filter((j) => sameMonth(jobDate(j), viewMonth));
    }
    return scoped.reduce((s, j) => s + (estimateJobPrice(j, servicesById) || 0), 0);
  }, [jobs, view, selectedDate, viewMonth, servicesById]);

  const monthStats = useMemo(() => {
    const monthJobs = jobs.filter((j) => j.scheduled_at && sameMonth(jobDate(j), viewMonth));
    const active = monthJobs.filter((j) => j.status !== "cancelled");
    const cancelledCount = monthJobs.length - active.length;
    const isCurrentMonth = sameMonth(viewMonth, new Date());
    const today = new Date();
    const daysInThisMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const openDaysAhead = isCurrentMonth
      ? Array.from({ length: daysInThisMonth }, (_, i) => i + 1)
          .filter((d) => d > today.getDate() && !active.some((j) => jobDate(j).getDate() === d && jobDate(j).getMonth() === viewMonth.getMonth()))
          .length
      : 0;
    return { jobCount: active.length, cancelledCount, openDaysAhead };
  }, [jobs, viewMonth]);

  const periodLabel = view === "day"
    ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : view === "week"
      ? (() => { const s = new Date(selectedDate); s.setDate(s.getDate() - s.getDay()); const e = new Date(s); e.setDate(e.getDate() + 6); const sameM = s.getMonth() === e.getMonth(); return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", sameM ? { day: "numeric" } : { month: "short", day: "numeric" })}`; })()
      : viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${P.border}`, position: "sticky", top: 0, background: P.bg, zIndex: 10, gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <BrandLockup size={30} businessId={businessId} realName={businessName} realLogoUrl={businessLogoUrl} />
            <div className="hidden lg:flex" style={{ alignItems: "center", gap: 14 }}>
              <div style={{ width: 1, height: 20, background: P.border }} />
              <span style={{ fontSize: 13, color: P.textSecondary, whiteSpace: "nowrap" }}>Schedule <span style={{ color: P.textMuted }}>· {periodLabel} · {formatDateTime(now)}</span></span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", border: `1px solid ${P.border}`, borderRadius: 9, overflow: "hidden" }}>
              {["day", "week", "month"].map((v) => (
                <button key={v} onClick={() => setView(v)} style={{ background: view === v ? P.accentSoft : "transparent", border: "none", color: view === v ? P.accent : P.textSecondary, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
              ))}
            </div>
            <button onClick={() => openAddJob(view === "day" ? selectedDate : new Date())} disabled={!businessId} style={{ display: "flex", alignItems: "center", gap: 6, background: `linear-gradient(120deg, ${P.accent}, ${P.secondary})`, color: P.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: businessId ? "pointer" : "default", opacity: businessId ? 1 : 0.6 }}><Plus size={14} /> New Job</button>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          {/* period nav + revenue */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => (view === "day" ? shiftDay(-1) : view === "week" ? shiftWeek(-1) : shiftMonth(-1))} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${P.border}`, background: "transparent", color: P.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ChevronLeft size={15} /></button>
              <span style={{ fontSize: 14, fontWeight: 700, color: P.textPrimary }}>{periodLabel}</span>
              <button onClick={() => (view === "day" ? shiftDay(1) : view === "week" ? shiftWeek(1) : shiftMonth(1))} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${P.border}`, background: "transparent", color: P.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ChevronRight size={15} /></button>
            </div>
            <div style={{ background: P.accentSoft, border: `1px solid ${P.accent}`, borderRadius: 20, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, color: P.accent }}>
              {view === "day" ? "Day" : view === "week" ? "Week" : "Month"} revenue (est.): {money(periodRevenue)}
            </div>
          </div>

          <Legend />

          {view === "month" && (visible.stats || editMode) && (
            visible.stats ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: P.textMuted }}>This month</span>
                  <VisibilityToggle editMode={editMode} visible={visible.stats} onToggle={() => toggleVisible("stats")} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                  <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: "12px 16px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>Jobs This Month</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: P.textPrimary, marginTop: 4 }}>{monthStats.jobCount}</div>
                    {monthStats.cancelledCount > 0 && <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>{monthStats.cancelledCount} cancelled</div>}
                  </div>
                  <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: "12px 16px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: P.textMuted }}>Est. Revenue</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: P.textPrimary, marginTop: 4 }}>{money(periodRevenue)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <HiddenGhost label="Jobs stats are hidden" onToggle={() => toggleVisible("stats")} />
            )
          )}

          {view === "month" && (visible.ai || editMode) && (
            visible.ai ? (
              <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${P.border}` }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: P.textPrimary }}><Sparkles size={14} color={P.accent} /> Atlas AI — staying on track</span>
                  <VisibilityToggle editMode={editMode} visible={visible.ai} onToggle={() => toggleVisible("ai")} />
                </div>
                <div style={{ padding: "12px 16px", fontSize: 13, color: P.textSecondary, lineHeight: 1.6 }}>
                  You're tracking to <strong style={{ color: P.textPrimary }}>{money(periodRevenue)}</strong> (estimated) this month across {monthStats.jobCount} jobs.
                  {monthStats.openDaysAhead > 0 && <> There {monthStats.openDaysAhead === 1 ? "is" : "are"} still <strong style={{ color: P.accent }}>{monthStats.openDaysAhead} open day{monthStats.openDaysAhead === 1 ? "" : "s"}</strong> left this month — good windows to fill with follow-ups or same-week bookings.</>}
                </div>
              </div>
            ) : (
              <HiddenGhost label="Atlas AI panel is hidden" onToggle={() => toggleVisible("ai")} />
            )
          )}

          {loading ? (
            <div style={{ background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: "40px 18px", textAlign: "center", fontSize: 13, color: P.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={15} className="animate-spin" /> Loading schedule…
            </div>
          ) : error ? (
            <div style={{ background: "rgba(255,107,94,0.1)", border: `1px solid ${P.danger}`, borderRadius: 14, padding: "18px", fontSize: 13, color: P.danger }}>{error}</div>
          ) : (
            <>
              {view === "month" && <MonthView jobs={jobs} viewMonth={viewMonth} moveJob={moveJob} previewDate={previewDate} setPreviewDate={setPreviewDate} showHolidays={visible.holidays} />}
              {view === "month" && previewDate && (
                <DayPreview date={previewDate} jobs={jobs} servicesById={servicesById} openFullDay={() => goToDate(previewDate)} onClose={() => setPreviewDate(null)} onAddJob={openAddJob} onEditJob={setEditingJob} showHolidays={visible.holidays} />
              )}
              {view === "week" && <WeekView jobs={jobs} selectedDate={selectedDate} goToDate={goToDate} />}
              {view === "day" && <DayView jobs={jobs} selectedDate={selectedDate} servicesById={servicesById} onEditJob={setEditingJob} showHolidays={visible.holidays} />}
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

      {(addOpen || editingJob) && (
        <AddJobModal
          businessId={businessId}
          businessName={businessName}
          customers={customers}
          vehicles={vehicles}
          services={services}
          jobs={jobs}
          initialDate={addDate}
          job={editingJob}
          onClose={() => { setAddOpen(false); setEditingJob(null); }}
          onAdded={handleAdded}
          onDelete={handleDeleteJob}
          onVehicleAdded={handleVehicleAdded}
        />
      )}
    </div>
  );
}
