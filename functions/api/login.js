import { json, isAdmin } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD is not set" }, 503);
  return isAdmin(request, env) ? json({ ok: true }) : json({ error: "unauthorized" }, 401);
}
