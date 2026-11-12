import { json, isAdmin } from "./_shared.js";

const KEY = "content";
const EMPTY = { content: {}, games: [], gedits: {} };

// Everyone: read the shared edits.
export async function onRequestGet({ env }) {
  if (!env.PP) return json({ error: "KV binding PP is missing" }, 503);
  const raw = await env.PP.get(KEY);
  return json(raw ? JSON.parse(raw) : EMPTY);
}

// Admin only: replace the shared edits.
export async function onRequestPut({ request, env }) {
  if (!env.PP) return json({ error: "KV binding PP is missing" }, 503);
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD is not set" }, 503);
  if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401);
  let d;
  try { d = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const body = JSON.stringify({
    content: d && typeof d.content === "object" ? d.content : {},
    games: Array.isArray(d && d.games) ? d.games : [],
    gedits: d && typeof d.gedits === "object" ? d.gedits : {},
  });
  if (body.length > 2_000_000) return json({ error: "too big" }, 413);
  await env.PP.put(KEY, body);
  return json({ ok: true });
}
