// Cloudflare Worker: static site, admin content APIs, multiplayer rooms.
import * as content from "./functions/api/content.js";
import * as login from "./functions/api/login.js";
import {handleRoom,PartyRoom} from "./functions/api/rooms.js";
export {PartyRoom};
export default {async fetch(request,env) {
 const {pathname}=new URL(request.url),ctx={request,env};
 if(pathname.startsWith("/api/rooms/"))return handleRoom(request,env);
 if(pathname==="/api/content"){
  if(request.method==="GET")return content.onRequestGet(ctx);
  if(request.method==="PUT")return content.onRequestPut(ctx);
  return new Response("Method not allowed",{status:405});
 }
 if(pathname==="/api/login"){
  if(request.method==="POST")return login.onRequestPost(ctx);
  return new Response("Method not allowed",{status:405});
 }
 if(pathname==="/admin"||pathname==="/admin/")return env.ASSETS.fetch(new Request(new URL("/",request.url),request));
 return env.ASSETS.fetch(request);
}};