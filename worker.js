// Cloudflare Worker: serves the static site from ./public and the admin API.
import * as content from "./functions/api/content.js";
import * as login from "./functions/api/login.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const ctx = { request, env };
    if (pathname === "/api/content") {
      if (request.method === "GET") return content.onRequestGet(ctx);
      if (request.method === "PUT") return content.onRequestPut(ctx);
      return new Response("Method not allowed", { status: 405 });
    }
    if (pathname === "/api/login") {
      if (request.method === "POST") return login.onRequestPost(ctx);
      return new Response("Method not allowed", { status: 405 });
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      // Admin login lives in the single-page app; serve it at /admin too.
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return env.ASSETS.fetch(request);
  },
};
