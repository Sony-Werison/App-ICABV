import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
let cookie='';let checks=0;const created=[];
async function api(method='GET',body,expected=200){const r=await fetch(base+'/api/records',{method,headers:{...(cookie?{cookie}:{}),origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));checks++;return data;}
const member={name:'Pessoa de teste local',email:'teste@example.com',phone:'',status:'Membro',ministry:'Louvor',birthday:'',notes:''};
const event={title:'Evento de teste local',date:'2026-12-20',time:'19:00',location:'Templo',capacity:100,status:'Planejado',notes:''};
try{
 await api('GET',undefined,401);
 const signin=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
 cookie=signin.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.ok(cookie,'Cookie de teste não recebido');
 const m=await api('POST',{kind:'member',data:member},201);created.push(m.id);
 const e=await api('POST',{kind:'event',data:event},201);created.push(e.id);
 const tx=await api('POST',{kind:'transaction',data:{description:'Oferta de teste local',direction:'Entrada',amount:15001,category:'Ofertas',date:'2026-12-20',status:'Realizado',notes:''}},201);created.push(tx.id);
 const data={ministry:'Louvor',duty:'Vocal',memberId:m.id,eventId:e.id,date:'2026-12-20',time:'19:00',status:'Pendente',notes:''};
 const scale=await api('POST',{kind:'schedule',data},201);created.push(scale.id);
 await api('POST',{kind:'schedule',data},409);
 await api('DELETE',{id:m.id,version:1},409);
 await api('DELETE',{id:e.id,version:1},409);
 await api('POST',{kind:'event',data:{...event,date:'2026-02-30'}},400);
 await api('POST',{kind:'transaction',data:{description:'Inválido',direction:'Entrada',amount:1.5,category:'Ofertas',date:'2026-12-20',status:'Realizado',notes:''}},400);
 await api('POST',{kind:'member',id:m.id,version:1,data:{...member,name:'Pessoa atualizada'}},200);
 await api('POST',{kind:'member',id:m.id,version:1,data:member},409);
 const list=await api();assert.equal(list.items.find(i=>i.id===tx.id).data.amount,15001);assert.equal(list.items.find(i=>i.id===m.id).version,2);
 const foreign=await fetch(base+'/api/records',{method:'POST',headers:{cookie,origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({kind:'member',data:member})});assert.equal(foreign.status,403);checks++;
 console.log(`OK: ${checks} verificações de API; quatro módulos, valores em centavos, datas, conflitos, vínculos, versões e autenticação.`);
}finally{
 if(cookie){const list=await api();for(const id of created.reverse()){const row=list.items.find(i=>i.id===id);if(row)await api('DELETE',{id,version:row.version});}}
}
