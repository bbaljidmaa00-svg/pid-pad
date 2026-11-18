const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const fail=(m,s=400)=>json({error:m},s);
const safeName=v=>String(v||"").trim().replace(/[<>]/g,"").slice(0,24);
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(20)),x=>x.toString(16).padStart(2,"0")).join("");
const visible=(r,t)=>({code:r.code,hostId:r.hostId,players:r.players.map(p=>({id:p.id,name:p.name})),phase:r.phase,round:r.round,card:r.card,ballotsCount:Object.keys(r.ballots).length,scores:r.scores||{},lastAward:r.lastAward||{},gameFinished:!!r.gameFinished,maxRounds:10,ballots:r.phase==="results"?r.ballots:{},selfId:r.players.find(p=>p.token===t)?.id||null,isHost:r.players.some(p=>p.token===t&&p.id===r.hostId),updatedAt:r.updatedAt});
export class PartyRoom {
 constructor(state,env){this.state=state;this.env=env}
 async fetch(req){
  const p=new URL(req.url).pathname.split("/").filter(Boolean),code=p[2],action=p[3]||"";
  if(!/^\d{6}$/.test(code||""))return fail("6 оронтой код оруулна уу.");
  let r=await this.state.storage.get("room");
  if(req.method==="POST"&&action==="init"){
   const d=await req.json().catch(()=>({})),name=safeName(d.name);
   if(!name)return fail("Нэрээ оруулна уу.");
   if(r&&Date.now()-r.updatedAt<=86400000)return fail("Энэ код ашиглагдсан байна.",409);
   const t=newToken(),id=newToken().slice(0,12);
   r={code,hostId:id,players:[{id,name,token:t}],phase:"lobby",round:0,card:null,ballots:{},scores:{[id]:0},lastAward:{},gameFinished:false,updatedAt:Date.now()};
   await this.state.storage.put("room",r);
   return json({token:t,room:visible(r,t)},201);
  }
  if(!r||Date.now()-r.updatedAt>86400000)return fail("Өрөө олдсонгүй эсвэл хугацаа нь дууссан байна.",404);
  if(req.method==="POST"&&action==="join"){
   const d=await req.json().catch(()=>({})),name=safeName(d.name);
   if(!name)return fail("Нэрээ оруулна уу.");
   if(r.phase==="closed")return fail("Өрөө хаагдсан байна.",410);
   if(r.players.length>=12)return fail("Өрөө дүүрсэн байна.",409);
   const t=newToken(),id=newToken().slice(0,12);
   r.players.push({id,name,token:t});r.scores=r.scores||{};r.scores[id]=0;r.updatedAt=Date.now();
   await this.state.storage.put("room",r);return json({token:t,room:visible(r,t)});
  }
  const t=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const player=r.players.find(p=>p.token===t);
  if(!player)return fail("Энэ өрөөнд дахин нэгдэнэ үү.",403);
  if(req.method==="GET"&&!action)return json({room:visible(r,t)});
  if(req.method!=="POST"||action!=="action")return fail("Үйлдэл олдсонгүй.",404);
  const d=await req.json().catch(()=>({})),host=player.id===r.hostId;
  r.scores=r.scores||{};r.lastAward=r.lastAward||{};
  if(d.type==="start"||d.type==="next"){
   if(!host)return fail("Зөвхөн өрөөний эзэн раунд эхлүүлнэ.",403);
   if(r.gameFinished||r.round>=10)return fail("10 раунд дууссан. Шинээр эхлүүлээрэй.",409);
   if(r.phase==="voting")return fail("Эхлээд үр дүнг нээнэ үү.",409);
   if(!["who","choice"].includes(d.mode))return fail("Тоглоомын төрөл буруу байна.");
   if(typeof d.prompt!=="string"||!d.prompt.trim()||d.prompt.length>240)return fail("Асуулт буруу байна.");
   const opts=d.mode==="choice"?d.options:r.players.map(p=>({id:p.id,label:p.name}));
   if(!Array.isArray(opts)||opts.length<2||opts.length>12)return fail("Сонголтын тоо буруу байна.");
   if(d.mode==="choice"&&opts.some(o=>!o||typeof o.label!=="string"||!o.label.trim()))return fail("Сонголт буруу байна.");
   r.round++;r.phase="voting";r.ballots={};r.lastAward={};
   r.card={mode:d.mode,prompt:d.prompt.trim(),options:opts.map((o,i)=>({id:String(o.id??i).slice(0,20),label:String(o.label||"").slice(0,110)}))};
  }else if(d.type==="vote"){
   if(r.phase!=="voting")return fail("Санал хураалт дууссан байна.",409);
   const opt=r.card?.options?.find(o=>o.id===String(d.optionId));if(!opt)return fail("Сонголт олдсонгүй.");
   r.ballots[player.id]=opt.id;
  }else if(d.type==="reveal"){
   if(!host)return fail("Зөвхөн өрөөний эзэн үр дүнг нээнэ.",403);
   if(r.phase!=="voting")return fail("Одоо санал хураалт байхгүй.");
   if(!Object.keys(r.ballots).length)return fail("Эхлээд санал өгнө үү.",409);
   const counts=Object.fromEntries(r.card.options.map(o=>[o.id,0]));
   for(const v of Object.values(r.ballots))if(Object.hasOwn(counts,v))counts[v]++;
   const best=Math.max(0,...Object.values(counts));
   const winners=r.card.options.filter(o=>counts[o.id]===best).map(o=>o.id);
   const award={};
   for(const id of Object.keys(r.ballots))award[id]=(award[id]||0)+1;
   if(r.card.mode==="who"){
    for(const id of winners)if(r.players.some(p=>p.id===id))award[id]=(award[id]||0)+2;
   }else{
    for(const [id,opt] of Object.entries(r.ballots))if(winners.includes(opt))award[id]=(award[id]||0)+1;
   }
   for(const [id,pts] of Object.entries(award))r.scores[id]=(r.scores[id]||0)+pts;
   r.lastAward=award;r.phase="results";if(r.round>=10)r.gameFinished=true;
  }else if(d.type==="reset"){
   if(!host)return fail("Зөвхөн өрөөний эзэн оноог шинээр эхлүүлнэ.",403);
   r.round=0;r.phase="lobby";r.card=null;r.ballots={};r.lastAward={};r.gameFinished=false;r.scores=Object.fromEntries(r.players.map(p=>[p.id,0]));
  }else if(d.type==="close"){
   if(!host)return fail("Зөвхөн өрөөний эзэн хааж болно.",403);r.phase="closed";
  }else return fail("Үйлдэл буруу байна.");
  r.updatedAt=Date.now();await this.state.storage.put("room",r);
  return json({room:visible(r,t)});
 }
}
export async function handleRoom(req,env){
 if(!env.ROOMS)return fail("Online Room тохиргоо суулгагдаагүй байна.",503);
 const parts=new URL(req.url).pathname.split("/").filter(Boolean);
 if(req.method==="POST"&&parts[2]==="create"){
  const data=await req.json().catch(()=>({}));
  for(let i=0;i<12;i++){
   const random=new Uint32Array(1);crypto.getRandomValues(random);
   const code=String(100000+random[0]%900000);
   const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
   const proxy=new Request(new URL("/api/rooms/"+code+"/init",req.url),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
   const res=await stub.fetch(proxy);
   if(res.status!==409)return res;
  }
  return fail("Өрөө үүсгэж чадсангүй.",503);
 }
 const code=parts[2];if(!/^\d{6}$/.test(code||""))return fail("6 оронтой код оруулна уу.");
 return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
}
