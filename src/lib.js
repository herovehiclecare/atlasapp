import { useEffect, useState } from "react";

// A shared ticking clock so every page header shows the same live date/time
// instead of each page freezing whatever it looked like when that page mounted.
// Ticks once a minute since the display only shows hour:minute — no need to
// re-render every second for a value that isn't shown.
export function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function formatDateTime(now) {
  const datePart = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timePart = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

// Bare "YYYY-MM-DD" strings (from `date` columns, e.g. due_date) are parsed
// by the JS Date constructor as UTC midnight, not local midnight — in any
// timezone behind UTC that silently rolls the displayed day back by one.
// Forcing a local-time component makes it parse as local midnight instead.
// Timestamptz strings (e.g. created_at) already carry an offset and don't
// need this, so they're passed straight through.
export function parseDate(input) {
  if (!input) return null;
  return typeof input === "string" && !input.includes("T")
    ? new Date(`${input}T00:00:00`)
    : new Date(input);
}

export function formatDate(input) {
  const d = parseDate(input);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Real ids are UUIDs — this gives a short, human-readable reference (e.g. for
// "Quote #A1B2C3D4") without displaying the full 36-character id everywhere.
export function shortId(id) { return id ? id.slice(0, 8).toUpperCase() : "NEW"; }

export function findService(services, id) { return services.find((s) => s.id === id); }

// A plain Google Maps URL rather than an iOS-only maps:// link — it opens
// the Google Maps app when installed (Android or iOS) and falls back to
// Maps in the browser otherwise, so it works regardless of which map app
// the customer's phone actually has.
export function directionsUrl(address) { return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`; }

// Services are priced per size class (car vs. suv/truck/van) rather than a
// single flat number, so every price lookup needs the vehicle it applies to.
// Shared by Quick Quote and Invoices so both itemize services identically.
export function svcPrice(service, vehicle) {
  if (!service) return 0;
  const isSuv = vehicle?.size_class === "suv_truck_van";
  const price = isSuv ? (service.price_suv_low ?? service.price_car_low) : service.price_car_low;
  return Number(price) || 0;
}

function csvField(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map(csvField).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// A full-resolution phone photo, base64-encoded, easily runs several MB —
// big enough to hit request-size limits on a plain UPDATE and fail with no
// usable error. A logo only ever renders at 30-52px, so downscaling client-
// side to a small square first keeps it reliably tiny (tens of KB) while
// still storing it as a plain data URL — no Storage bucket needed.
//
// The output canvas is always a perfect square with the source image
// centered and scaled to fit inside it (never cropped) — every badge that
// displays it downstream is round or square, so a non-square source
// (common for logos) would otherwise get off-center cropping wherever it's
// shown. Padding uses transparent PNG, not a cropped edge.
export function resizeImageToDataUrl(file, maxDimension = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(maxDimension / img.width, maxDimension / img.height, 1);
        const drawWidth = Math.round(img.width * scale);
        const drawHeight = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = maxDimension;
        canvas.height = maxDimension;
        canvas.getContext("2d").drawImage(
          img,
          Math.round((maxDimension - drawWidth) / 2),
          Math.round((maxDimension - drawHeight) / 2),
          drawWidth,
          drawHeight
        );
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// businesses.ui_prefs holds per-page visibility toggles (Dashboard's and
// Schedule's Customize panels each own a sub-key). A plain overwrite from one
// page would silently wipe out whatever the other page last saved, so this
// re-reads the column immediately before writing and shallow-merges the
// patch in, rather than trusting a copy of the column that may be stale.
export async function mergeBusinessJsonb(supabase, businessId, column, patch) {
  const { data, error: fetchError } = await supabase.from("businesses").select(column).eq("id", businessId).single();
  if (fetchError) throw fetchError;
  const merged = { ...(data?.[column] || {}), ...patch };
  const { error: updateError } = await supabase.from("businesses").update({ [column]: merged }).eq("id", businessId);
  if (updateError) throw updateError;
  return merged;
}

// Uploads files to a public Storage bucket under a folder (e.g. a business or
// record id) and returns their public URLs, ready to store in a jsonb column.
export async function uploadImages(supabase, bucket, folder, files) {
  const urls = [];
  for (const file of files) {
    const path = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
