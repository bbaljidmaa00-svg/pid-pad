// Room state is stored in a SQLite-backed Cloudflare Durable Object.
// Each 6-digit room code resolves to one serialized, shared room object.
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const error=(message,status=400)=>response({error:message},status);
const clean=value=>String(value||'').trim().replace(/[<>]/g,'').slice(0,24);
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(20)),x=>x.toString(16).padStart(2,'0')).join('');
const publicRoom=(r,t)=>({
  code:r.code,hostId:r.hostId,players:r.players.map(p=>({id:p.id,name:p.name})),phase:r.phase,
  round:r.round,card:r.card,ballotsCount:Object.keys(r.ballots).length,
  scores:r.scores||{},lastAward:r.lastAward||{},gameFinished:!!r.gameFinished,maxRounds:10,
  ballots:r.phase==='results'?r.ballots:{},selfId:r.players.find(p=>p.token===t)?.id||null,
  isHost:r.players.some(p=>p.token===t&&p.id===r.hostId),updatedAt:r.updatedAt,
  imposter:r.imposter ? {
    count:r.imposter.count,category:r.imposter.category,
    role:r.imposter.impostorIds.includes(r.players.find(p=>p.token===t)?.id)?'imposter':'regular',
    ...(r.phase==='imposter_results'?{word:r.imposter.word,impostors:r.players.filter(p=>r.imposter.impostorIds.includes(p.id)).map(p=>p.name)}:{word:r.imposter.impostorIds.includes(r.players.find(p=>p.token===t)?.id)?null:r.imposter.word})
  }:null
});
export class PartyRoom{
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(req){
    const url=new URL(req.url),parts=url.pathname.split('/').filter(Boolean),code=parts[2];
    if(!/^\d{6}$/.test(code||''))return error('6 оронтой код оруулна уу.');
    const action=parts[3]||'';
    if(req.method==='POST'&&action==='init'){
      const data=await req.json().catch(()=>({}));const name=clean(data.name);
      if(!name)return error('Нэрээ оруулна уу.');
      let room=await this.ctx.storage.get('room');
      if(room&&Date.now()-room.updatedAt<=86400000)return error('Энэ код аль хэдийн ашиглагдсан байна.',409);
      const t=token(),id=token().slice(0,12);
      room={code,hostId:id,players:[{id,token:t,name}],phase:'lobby',round:0,card:null,ballots:{},scores:{[id]:0},lastAward:{},gameFinished:false,updatedAt:Date.now()};
      await this.ctx.storage.put('room',room);return response({token:t,room:publicRoom(room,t)},201);
    }
    const room=await this.ctx.storage.get('room');
    if(!room||Date.now()-room.updatedAt>86400000)return error('Өрөө олдсонгүй эсвэл хугацаа нь дууссан байна.',404);
    if(req.method==='POST'&&action==='join'){
      const data=await req.json().catch(()=>({})),name=clean(data.name);
      if(!name)return error('Нэрээ оруулна уу.');
      if(room.phase!=='lobby'&&room.phase!=='results'&&room.phase!=='imposter_results')return error('Тоглолт эхэлсэн байна. Дараагийн тойргийг хүлээнэ үү.',409);
      if(room.players.length>=12)return error('Өрөө дүүрсэн байна (12 хүн).',409);
      const id=token().slice(0,12),t=token();
      room.players.push({id,token:t,name});room.scores=room.scores||{};room.scores[id]=0;room.updatedAt=Date.now();
      await this.ctx.storage.put('room',room);return response({token:t,room:publicRoom(room,t)});
    }
    const t=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    const player=room.players.find(p=>p.token===t);
    if(!player)return error('Энэ өрөөнд дахин нэгдэнэ үү.',403);
    if(req.method==='GET'&&!action)return response({room:publicRoom(room,t)});
    if(req.method==='POST'&&action==='action'){
      const data=await req.json().catch(()=>({}));
      const host=player.id===room.hostId;
      room.scores=room.scores||{};room.lastAward=room.lastAward||{};
      if(data.type==='imposter_start'){
        if(!host)return error('Зөвхөн хост Imposter эхлүүлнэ.',403);
        if(!['lobby','results','imposter_results'].includes(room.phase)||room.gameFinished||room.round>=10)return error('Энэ раундыг эхлүүлж болохгүй.',409);
        if(room.players.length<3)return error('Imposter тоглоход дор хаяж 3 хүн хэрэгтэй.');
        const count=Number(data.count),cap=Math.max(1,room.players.length-2);
        if(!Number.isInteger(count)||count<1||count>cap)return error('Хуурамчийн тоог шалгаарай.');
        const custom=data.source==='custom';
        const built={
          'Хоол':['Бууз','Хуушуур','Цуйван','Пицца','Хорхог','Суши'],
          'Газар':['Кино театр','Сургууль','Хөвсгөл','Нисэх буудал','Караоке'],
          'Юм':['Чихэвч','Толь','Түлхүүр','Зурагт','Шүхэр'],
          'Үйл явдал':['Шалгалт','Хурим','Төрсөн өдөр','Аялал','Төгсөлт']
        };
        const cats=Object.keys(built),rand=n=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n;};
        const category=custom?String(data.category||'Нууц үг').trim().slice(0,40):cats[rand(cats.length)];
        const word=custom?String(data.word||'').trim().slice(0,70):built[category][rand(built[category].length)];
        if(!word)return error('Нууц үгээ оруулна уу.');
        const pool=room.players.filter(p=>!custom||p.id!==room.hostId).map(p=>p.id);
        for(let i=pool.length-1;i>0;i--){const j=rand(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
        room.imposter={word,category,count,impostorIds:pool.slice(0,count)};
        room.round++;room.phase='imposter';room.ballots={};room.lastAward={};room.card=null;
      }else if(data.type==='imposter_vote'){
        if(room.phase!=='imposter')return error('Одоогоор санал хураалт идэвхгүй байна.');
        const target=room.players.find(p=>p.id===String(data.optionId));
        if(!target||target.id===player.id)return error('Бусад тоглогчоос сонгоорой.');
        room.ballots[player.id]=target.id;
      }else if(data.type==='imposter_reveal'){
        if(!host)return error('Зөвхөн хост хуурамчийг илчилнэ.',403);
        if(room.phase!=='imposter')return error('Imposter тоглоом идэвхгүй байна.');
        const award={};
        for(const [voterId,targetId] of Object.entries(room.ballots)){
          award[voterId]=(award[voterId]||0)+1;
          if(room.imposter.impostorIds.includes(targetId))award[voterId]+=2;
        }
        for(const [id,points] of Object.entries(award))room.scores[id]=(room.scores[id]||0)+points;
        room.lastAward=award;room.phase='imposter_results';if(room.round>=10)room.gameFinished=true;
      }else if(data.type==='next'||data.type==='start'){
        if(!host)return error('Зөвхөн өрөөний эзэн раунд эхлүүлнэ.',403);
        if(room.gameFinished||room.round>=10)return error('10 раунд дууссан. Оноог шинээр эхлүүлээрэй.',409);
        if(room.phase==='voting'||room.phase==='imposter')return error('Эхлээд одоогийн раундын үр дүнг нээнэ үү.',409);
        if(!['who','choice'].includes(data.mode))return error('Тоглоомын төрөл буруу байна.');
        if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>240)return error('Асуулт буруу байна.');
        const opts=data.mode==='choice'?data.options:room.players.map(p=>({id:p.id,label:p.name}));
        if(!Array.isArray(opts)||opts.length<2||opts.length>12)return error('Сонголтын тоо буруу байна.');
        room.round++;room.phase='voting';room.imposter=null;room.ballots={};room.lastAward={};
        room.card={mode:data.mode,prompt:data.prompt.trim(),options:opts.map((o,i)=>({id:String(o.id??i).slice(0,20),label:String(o.label||'').slice(0,110)}))};
      }else if(data.type==='vote'){
        if(room.phase!=='voting')return error('Санал хураалт дууссан байна.',409);
        const choice=room.card?.options?.find(o=>o.id===String(data.optionId));
        if(!choice)return error('Сонголт олдсонгүй.');
        room.ballots[player.id]=choice.id;
      }else if(data.type==='reveal'){
        if(!host)return error('Зөвхөн өрөөний эзэн үр дүнг нээнэ.',403);
        if(room.phase!=='voting')return error('Одоо санал хураалт байхгүй.');
        if(!Object.keys(room.ballots).length)return error('Эхлээд ядаж нэг хүн санал өгнө.',409);
        const counts=Object.fromEntries(room.card.options.map(o=>[o.id,0]));
        for(const optionId of Object.values(room.ballots)){
          if(Object.hasOwn(counts,optionId))counts[optionId]++;
        }
        const maxVotes=Math.max(0,...Object.values(counts));
        const winnerOptions=room.card.options.filter(o=>counts[o.id]===maxVotes).map(o=>o.id);
        const award={};
        for(const voterId of Object.keys(room.ballots))award[voterId]=(award[voterId]||0)+1;
        if(room.card.mode==='who'){
          for(const winnerId of winnerOptions){
            if(room.players.some(p=>p.id===winnerId))award[winnerId]=(award[winnerId]||0)+2;
          }
        }else{
          for(const [voterId,optionId] of Object.entries(room.ballots)){
            if(winnerOptions.includes(optionId))award[voterId]=(award[voterId]||0)+1;
          }
        }
        for(const [id,points] of Object.entries(award))room.scores[id]=(room.scores[id]||0)+points;
        room.lastAward=award;
        room.phase='results';
        if(room.round>=10)room.gameFinished=true;
      }else if(data.type==='reset'){
        if(!host)return error('Зөвхөн өрөөний эзэн оноог шинээр эхлүүлнэ.',403);
        room.round=0;room.phase='lobby';room.imposter=null;room.card=null;room.ballots={};room.lastAward={};room.gameFinished=false;
        room.scores=Object.fromEntries(room.players.map(p=>[p.id,0]));
      }else if(data.type==='close'){
        if(!host)return error('Зөвхөн өрөөний эзэн хааж болно.',403);
        room.phase='closed';
      }else return error('Үйлдэл буруу байна.');
      room.updatedAt=Date.now();await this.ctx.storage.put('room',room);
      return response({room:publicRoom(room,t)});
    }
    return error('Үйлдэл олдсонгүй.',404);
  }
}
export async function handleRoom(req,env){
  if(!env.ROOMS)return error('Online Room тохиргоо суулгагдаагүй байна.',503);
  const url=new URL(req.url),parts=url.pathname.split('/').filter(Boolean);
  if(req.method==='POST'&&parts[2]==='create'){
    const data=await req.json().catch(()=>({}));
    for(let attempt=0;attempt<12;attempt++){
      const random=new Uint32Array(1);crypto.getRandomValues(random);
      const code=String(100000+random[0]%900000);
      const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
      const proxy=new Request(new URL(`/api/rooms/${code}/init`,req.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
      const res=await stub.fetch(proxy);
      if(res.status!==409)return res;
    }
    return error('Өрөө үүсгэж чадсангүй.',503);
  }
  const code=parts[2];if(!/^\d{6}$/.test(code||''))return error('6 оронтой код оруулна уу.');
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
}
