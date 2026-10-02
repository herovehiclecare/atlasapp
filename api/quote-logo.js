// Serves a business's logo as a real fetchable image URL, for use as the
// quote page's og:image. businesses.logo_url is stored as a base64 data:
// URI (set via a file upload in Settings), which link-preview crawlers
// (iMessage, Slack, etc.) can't fetch directly - og:image has to be an
// actual http(s) URL. This decodes that data URI back into real image
// bytes on request instead.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const FN_URL = `${SUPABASE_URL}/functions/v1/quote-portal`;

export default async function handler(req, res) {
  const token = req.query.token;
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  const upstream = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}&format=json`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!upstream.ok) {
    res.status(404).send("Not found");
    return;
  }

  const data = await upstream.json();
  const logoUrl = data?.business?.logo_url || "";
  const match = /^data:([^;]+);base64,(.+)$/.exec(logoUrl);

  if (match) {
    const [, mime, base64] = match;
    const buf = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(buf);
    return;
  }

  if (/^https?:\/\//.test(logoUrl)) {
    res.setHeader("Location", logoUrl);
    res.status(302).end();
    return;
  }

  res.status(404).send("No logo");
}
