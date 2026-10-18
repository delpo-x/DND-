// Prova manuale di Ollama reale tramite l'app in esecuzione (STUDIO_URL, default http://127.0.0.1:4173). Cambia le impostazioni IA della app e crea una campagna di prova.
const B=process.env.STUDIO_URL ?? "http://127.0.0.1:4173";
const j=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:b?{"content-type":"application/json"}:{},body:b?JSON.stringify(b):undefined});return {s:r.status,j:await r.json()}};
const c=(await j("POST","/api/campaigns",{generate:true,params:{seed:"ollama1"}})).j.campaign.id;
console.log("settings",(await j("PUT","/api/settings/ai",{provider:"ollama"})).j.status);
const npcs=(await j("GET",`/api/campaigns/${c}/entities?type=npc`)).j;
for (const [e,f] of [[npcs[0],"personality"],[npcs[1],"role"],[npcs[2],"role"]]) {
  const before=e.data[f]; const t=Date.now();
  const r=await j("POST",`/api/entities/${e.id}/regenerate`,{field:f,seed:5});
  console.log(f,r.s,((Date.now()-t)/1000).toFixed(1)+"s");
  console.log(" prima:",JSON.stringify(before)); console.log(" dopo :",JSON.stringify(r.j.entity?.data?.[f]??r.j.error));
}
const q=(await j("GET",`/api/campaigns/${c}/entities?type=quest`)).j[0];
const r=await j("POST",`/api/entities/${q.id}/regenerate`,{field:"premise",seed:2});console.log("premise",r.s,JSON.stringify(r.j.entity?.data?.premise??r.j.error));
console.log("coerenza",(await j("GET",`/api/campaigns/${c}/check`)).j.summary);
