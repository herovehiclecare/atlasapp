// Serves a business's public quote page at /e/<slug> with link-preview tags
// (title, logo, theme colour) written into the HTML. Link-preview crawlers
// (iMessage, Slack, Facebook) don't run JavaScript, so the page's own script
// can't set these - they have to be in the HTML that comes back.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://fqggnekepfzxrkuazpiy.supabase.co";
const FN_URL = `${SUPABASE_URL}/functions/v1/estimate-request`;
const THEME_BG = { forest: "#06100C", midnight: "#060A14", charcoal: "#0C0C0D", bone: "#F4F6F5" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const slug = String(req.query.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;

  let html;
  try {
    html = await (await fetch(`${origin}/estimate/index.html`)).text();
  } catch {
    res.status(502).send("Page unavailable");
    return;
  }

  let brand = null;
  let copy = null;
  if (slug) {
    try {
      const r = await fetch(`${FN_URL}?slug=${encodeURIComponent(slug)}`);
      if (r.ok) {
        const c = (await r.json()).config;
        brand = c?.brand || null;
        copy = c?.copy || null;
      }
    } catch { /* fall back to the generic page */ }
  }

  if (brand?.name) {
    const name = String(brand.name).slice(0, 80);
    const title = `${copy?.headline || "Get Your Quote"} — ${name}`;
    const desc = String(brand.tagline || "See your price in minutes and send your request.").slice(0, 160);
    const color = THEME_BG[brand.theme] || brand.accent || THEME_BG.forest;
    const logo = /^https?:\/\//.test(brand.logo || "") ? brand.logo : "";
    const url = `${origin}/e/${slug}`;
    const tags = [
      `<title>${esc(title)}</title>`,
      `<meta name="theme-color" content="${esc(color)}">`,
      `<meta name="description" content="${esc(desc)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${esc(name)}">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      logo ? `<meta property="og:image" content="${esc(logo)}">` : "",
      logo ? `<meta name="twitter:card" content="summary">` : "",
      logo ? `<link rel="apple-touch-icon" href="${esc(logo)}">` : "",
      logo ? `<link rel="icon" href="${esc(logo)}">` : "",
    ].filter(Boolean).join("\n");
    html = html.replace(/<title>[^<]*<\/title>/, tags);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).send(html);
}
