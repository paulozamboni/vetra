import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(line=>/^VETRA_API_/.test(line)).map(line=>{const p=line.indexOf('=');return [line.slice(0,p),JSON.parse(line.slice(p+1))];}));
const base='https://api.itasistema.com.br';
const login=await fetch(base+'/user/login',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:env.VETRA_API_LOGIN,password:env.VETRA_API_PASSWORD}),signal:AbortSignal.timeout(20000)});
const auth=await login.json();
if(!login.ok||!auth.data?.token){console.log(JSON.stringify({stage:'authentication',status:login.status,success:false}));process.exit(1);}
console.log(JSON.stringify({stage:'authentication',status:login.status,success:true}));
if(process.argv.includes('--quote')){
 const response=await fetch(base+'/cotacao?destaque=1&order=menor_preco',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.data.token},body:JSON.stringify({cliente:4,empresa:1418,servico:1,destino_categorias:{add:[30]},vigencia_inicio:'2026-12-10',vigencia_fim:'2026-12-20',passageiros:[{idade:35}],viagem_tipo:1,familiar:false}),signal:AbortSignal.timeout(25000)});
 const body=await response.json();
 console.log(JSON.stringify({stage:'quote',status:response.status,id:body.data?.id,days:body.data?.vigencia,company:body.data?.empresa?.id,count:body.data?.planos?.length,metadata:body.data?Object.fromEntries(Object.entries(body.data).filter(([k])=>!['planos','passageiros','criado_por','empresa'].includes(k))):null,plans:body.data?.planos?.slice(0,1),error:body.error?.msg}));
 process.exit(response.ok?0:1);
}
for(const route of ['/destino-categoria/list?cliente=4&ativo=1','/plano/viagem-tipo/list?cliente=4','/plano/?cliente=4&publicado=1&per_page=100','/cambio?cliente=4&per_page=1','/tarifa-acordo?cliente=4&per_page=1']){
 const response=await fetch(base+route,{headers:{Authorization:'Bearer '+auth.data.token},redirect:'error',signal:AbortSignal.timeout(20000)});
 const body=await response.json(); const items=Array.isArray(body.data)?body.data:body.data?.items;
 console.log(JSON.stringify({route,status:response.status,count:items?.length,total:body.data?.meta?.total,items:route.includes('destino')||route.includes('viagem-tipo')?items:undefined,sample:route.includes('/plano/?')?items?.slice(0,2).map(i=>({id:i.id,nome:i.nome,servico:i.servico,tarifa_moeda:i.tarifa_moeda})):undefined}));
}
