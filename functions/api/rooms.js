// Cloudflare Durable Object for one private party room (one object per 6-digit code).
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const fail=(message,status=400)=>json({error:message},status);
const nameOf=v=>String(v||"").trim().replace(/[<>]/g,"").slice(0,24);
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(20)),x=>x.toString(16).padStart(2,"0")).join("");
const view=(r,t)=>({
 code:r.code,hostId:r.hostId,players:r.players.map(p=>({id:p.id,name:p.name})),
 phase:r.phase,round:r.round,card:r.card,ballotsCount:Object.keys(r.ballots).length,
 scores:r.scores||{},lastAward:r.lastAward||{},gameFinished:!!r.gameFinished,maxRounds:10,
 ballots:r.phase==="results"?r.ballots:{},selfId:r.players.find(p=>p.token===t)?.id||null,
 isHost:r.players.some(p=>p.token===t&&p.id===r.hostId),updatedAt:r.updatedAt
});
export class PartyRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  const url=new URL(request.url),parts=url.pathname.split("/").filter(Boolean),code=parts[2],action=parts[3]||"";
  if(!/^\d{6}$/.test(code||""))return fail("6 оронтой код оруулна уу.");
  if(request.method==="POST"&&action==="init"){
   const d=await request.json().catch(()=>({})),name=nameOf(d.name);
   if(!name)return fail("Нэрээ оруулна уу.");
   const existing=await this.ctx.storage.get("room");
   if(existing&&Date.now()-existing.updatedAt<=86400000)return fail("Энэ код аль хэдийн ашиглагдсан байна.",409);
   const t=secret(),id=secret().slice(0,12);
   const room={code,hostId:id,players:[{id,name,token:t}],phase:"lobby",round:0,card:null,ballots:{},scores:{[id]:0},lastAward:{},gameFinished:false,updatedAt:Date.now()};
   await this.ctx.storage.put("room",room);
   return json({token:t,room:view(room,t)},201);
  }
  const room=await this.ctx.storage.get("room");
  if(!room||Date.now()-room.updatedAt>86400000)return fail("Өрөө олдсонгүй эсвэл хугацаа нь дууссан байна.",404);
  if(request.method==="POST"&&action==="join"){
   const d=await request.json().catch(()=>({})),name=nameOf(d.name);
   if(!name)return fail("Нэрээ оруулна уу.");
   if(room.phase==="closed")return fail("Өрөө хаагдсан байна.",410);
   if(room.players.length>=12)return fail("Өрөө дүүрсэн байна (12 хүн).",409);
   const id=secret().slice(0,12),t=secret();
   room.players.push({id,token:t,name});room.scores=room.scores||{};room.scores[id]=0;
   room.updatedAt=Date.now();await this.ctx.storage.put("room",room);
   return json({token:t,room:view(room,t)});
  }
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const player=room.players.find(p=>p.token===token);
  if(!player)return fail("Энэ өрөөнд дахин нэгдэнэ үү.",403);
  if(request.method==="GET"&&!action)return json({room:view(room,token)});
  if(request.method!=="POST"||action!=="action")return fail("Үйлдэл олдсонгүй.",404);
  const d=await request.json().catch(()=>({})),host=player.id===room.hostId;
  room.scores=room.scores||{};room.lastAward=room.lastAward||{};
  if(d.type==="next"||d.type==="start"){
   if(!host)return fail("Зөвхөн өрөөний эзэн раунд эхлүүлнэ.",403);
   if(room.gameFinished||room.round>=10)return fail("10 раунд дууссан. Оноог шинээр эхлүүлээрэй.",409);
   if(room.phase==="voting")return fail("Эхлээд одоогийн раундын үр дүнг нээнэ үү.",409);
   if(!["who","choice"].includes(d.mode))return fail("Тоглоомын төрөл буруу байна.");
   if(typeof d.prompt!=="string"||!d.prompt.trim()||d.prompt.length>240)return fail("Асуулт буруу байна.");
   const options=d.mode==="choice"?d.options:room.players.map(p=>({id:p.id,label:p.name}));
   if(!Array.isArray(options)||options.length<2||options.length>12)return fail("Сонголтын тоо буруу байна.");
   room.round++;room.phase="voting";room.ballots={};room.lastAward={};
   room.card={mode:d.mode,prompt:d.prompt.trim(),options:options.map((o,i)=>({id:String(o?.id??i).slice(0,20),label:String(o?.label||"").slice(0,110)}))};
  }else if(d.type==="vote"){
   if(room.phase!=="voting")return fail("Санал хураалт дууссан байна.",409);
   const c=room.card?.options?.find(o=>o.id===String(d.optionId));
   if(!c)return fail("Сонголт олдсонгүй.");
   room.ballots[player.id]=c.id;
  }else if(d.type==="reveal"){
   if(!host)return fail("Зөвхөн өрөөний эзэн үр дүнг нээнэ.",403);
   if(room.phase!=="voting")return fail("Одоо санал хураалт байхгүй.");
   if(!Object.keys(room.ballots).length)return fail("Эхлээд ядаж нэг хүн санал өгнө.",409);
   const counts=Object.fromEntries(room.card.options.map(o=>[o.id,0]));
   for(const id of Object.values(room.ballots))if(Object.hasOwn(counts,id))counts[id]++;
   const max=Math.max(0,...Object.values(counts));
   const leaders=room.card.options.filter(o=>counts[o.id]===max).map(o=>o.id);
   const award={};
   for(const id of Object.keys(room.ballots))award[id]=(award[id]||0)+1;
   if(room.card.mode==="who"){
    for(const id of leaders)if(room.players.some(p=>p.id===id))award[id]=(award[id]||0)+2;
   }else{
    for(const [id,opt] of Object.entries(room.ballots))if(leaders.includes(opt))award[id]=(award[id]||0)+1;
   }
   for(const [id,points] of Object.entries(award))room.scores[id]=(room.scores[id]||0)+points;
   room.lastAward=award;room.phase="results";if(room.round>=10)room.gameFinished=true;
  }else if(d.type==="reset"){
   if(!host)return fail("Зөвхөн өрөөний эзэн оноог шинээр эхлүүлнэ.",403);
   room.round=0;room.phase="lobby";room.card=null;room.ballots={};room.lastAward={};room.gameFinished=false;
   room.scores=Object.fromEntries(room.players.map(p=>[p.id,0]));
  }else if(d.type==="close"){
   if(!host)return fail("Зөвхөн өрөөний эзэн хааж болно.",403);
   room.phase="closed";
  }else return fail("Үйлдэл буруу байна.");
  room.updatedAt=Date.now();await this.ctx.storage.put("room",room);
  return json({room:view(room,token)});
 }
}
export async function handleRoom(request,env){
 if(!env.ROOMS)return fail("Online Room тохиргоо суулгагдаагүй байна.",503);
 const url=new URL(request.url),parts=url.pathname.split("/").filter(Boolean);
 if(request.method==="POST"&&parts[2]==="create"){
  const d=await request.json().catch(()=>({}));
  for(let n=0;n<12;n++){
   const v=new Uint32Array(1);crypto.getRandomValues(v);
   const code=String(100000+v[0]%900000);
   const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
   const proxy=new Request(new URL("/api/rooms/"+code+"/init",request.url),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});
   const result=await stub.fetch(proxy);
   if(result.status!==409)return result;
  }
  return fail("Өрөө үүсгэж чадсангүй.",503);
 }
 const code=parts[2];if(!/^\d{6}$/.test(code||""))return fail("6 оронтой код оруулна уу.");
 return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
}
