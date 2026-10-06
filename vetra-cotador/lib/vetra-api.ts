// Only import this module from server routes. Credentials and upstream tokens never leave it.
import { z } from 'zod';
import { catalogSchema, quoteSchema, exchangeSchema, planDetailsSchema, type PlanDetails, type Catalog, type QuoteInput } from './quote-contract';
import { usdToBrl } from './currency';
import { serverEnv } from './server-env';
const BASE = 'https://api.itasistema.com.br';
const CLIENT = 4;
const COMPANY = 1418;
export class VetraError extends Error {
  constructor(public code: 'not_configured'|'authentication'|'unavailable'|'invalid_destination'|'invalid_response'|'not_found', public status=503) { super(code); }
}
let tokenCache: {value:string;expires:number}|undefined;
let tokenPending: Promise<string>|undefined;
let catalogCache: {value:Catalog;expires:number}|undefined;
async function request(path:string, init:RequestInit={}) {
  try {
    return await fetch(BASE+path,{...init,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(25000)});
  } catch(error) { console.warn('Vetra transport:', error instanceof Error?error.name+': '+error.message:'failed'); throw new VetraError('unavailable'); }
}
async function login() {
  const environment=await serverEnv();
  const login=environment.VETRA_API_LOGIN, password=environment.VETRA_API_PASSWORD;
  if(!login||!password) throw new VetraError('not_configured');
  const response=await request('/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password})});
  if(!response.ok) throw new VetraError('authentication');
  const parsed=z.object({data:z.object({token:z.string().min(1)})}).safeParse(await response.json().catch(()=>null));
  if(!parsed.success) throw new VetraError('invalid_response');
  // A short cache is also valid for opaque tokens; 401 invalidates it below.
  let expires=Date.now()+10*60*1000;
  try { const payload=JSON.parse(atob(parsed.data.data.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if(typeof payload.exp==='number') expires=Math.min(expires,payload.exp*1000-60000); } catch {}
  tokenCache={value:parsed.data.data.token,expires};
  return tokenCache.value;
}
async function token() {
  if(tokenCache && tokenCache.expires>Date.now()) return tokenCache.value;
  if(!tokenPending) tokenPending=login().finally(()=>{tokenPending=undefined;});
  return tokenPending;
}
export async function vetraRequest(path:string, body?:unknown) {
  let auth=await token();
  const invoke=()=>request(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});
  let response=await invoke();
  if(response.status===401){tokenCache=undefined;auth=await token();response=await invoke();}
  if(!response.ok) throw new VetraError(response.status===401||response.status===403?'authentication':'unavailable');
  const data=await response.json().catch(()=>null);
  if(!data||typeof data!=='object'||'error' in data) throw new VetraError('invalid_response');
  return data as unknown;
}
export async function getCatalog() {
  if(catalogCache&&catalogCache.expires>Date.now()) return catalogCache.value;
  const list=z.object({data:z.array(z.object({id:z.number().int().positive(),nome:z.string()}))});
  const [destinations,tripTypes]=await Promise.all([
    vetraRequest('/destino-categoria/list?cliente=4&ativo=1'),
    vetraRequest('/plano/viagem-tipo/list?cliente=4'),
  ]);
  const d=list.safeParse(destinations), t=list.safeParse(tripTypes);
  if(!d.success||!t.success) throw new VetraError('invalid_response');
  const value=catalogSchema.parse({destinations:d.data.data,tripTypes:t.data.data});
  catalogCache={value,expires:Date.now()+5*60*1000};
  return value;
}
const numeric=z.union([z.number(),z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number)]);
const upstreamCoverage=z.object({id:z.number(),valor:numeric.nullable(),coberto:z.boolean(),exibe_na_cotacao:z.boolean().optional(),moeda:z.object({prefixo:z.string(),nome:z.string()}).nullable().optional(),cobertura_item:z.object({id:z.number(),descritivo:z.string(),resumo:z.string().nullable().optional()})});
const upstreamPlan=z.object({data:z.object({id:z.number().int().positive(),nome:z.string(),publicado:z.boolean(),servico:z.object({id:z.number()}),coberturas:z.array(upstreamCoverage),observacao_geral:z.string().nullable().optional(),idade_maxima:numeric.nullable().optional(),vigencia_minima:numeric.nullable().optional(),vigencia_maxima:numeric.nullable().optional(),descricao_politica_agravo:z.string().nullable().optional()})});
export function normalizePlanDetails(raw:unknown, expectedId:number) {
  const parsed=upstreamPlan.safeParse(raw);
  if(!parsed.success) throw new VetraError('invalid_response');
  const d=parsed.data.data;
  if(d.id!==expectedId||!d.publicado||d.servico.id!==1) throw new VetraError('not_found',404);
  const conditions:Array<{label:string;value:string}>=[];
  if(d.idade_maxima!=null)conditions.push({label:'Idade máxima informada',value:`${d.idade_maxima} anos`});
  if(d.vigencia_minima!=null)conditions.push({label:'Vigência mínima',value:`${d.vigencia_minima} dias`});
  if(d.vigencia_maxima!=null)conditions.push({label:'Vigência máxima',value:`${d.vigencia_maxima} dias`});
  if(d.descricao_politica_agravo?.trim())conditions.push({label:'Política de idade e agravo informada',value:d.descricao_politica_agravo.trim()});
  return planDetailsSchema.parse({id:d.id,name:d.nome,notes:d.observacao_geral??'',conditions,coverages:d.coberturas.map(c=>({id:c.cobertura_item.id,label:c.cobertura_item.descritivo.trim(),description:c.cobertura_item.resumo??'',included:c.coberto,value:c.valor,currency:c.moeda?.nome==='Dólar'?'US$':c.moeda?.prefixo??''}))});
}
const detailsCache=new Map<number,{value:PlanDetails;expires:number}>();
export async function getPlanDetails(id:number) {
  if(!Number.isSafeInteger(id)||id<=0)throw new VetraError('not_found',404);
  const cached=detailsCache.get(id);
  if(cached&&cached.expires>Date.now())return cached.value;
  const value=normalizePlanDetails(await vetraRequest(`/plano/${id}?cliente=4`),id);
  if(detailsCache.size>=100)detailsCache.delete(detailsCache.keys().next().value!);
  detailsCache.set(id,{value,expires:Date.now()+5*60*1000});
  return value;
}
const upstreamQuote=z.object({data:z.object({id:z.number(),vigencia:z.number(),vigencia_inicio:z.string(),vigencia_fim:z.string(),empresa:z.object({id:z.number()}).optional(),passageiros:z.array(z.unknown()),planos:z.array(z.object({id:z.number(),tarifa:numeric.nullable(),error:z.string().nullable().optional(),destaque:z.boolean().optional(),mais_vendido:z.boolean().optional(),parcela_maxima:numeric.nullable().optional(),plano:z.object({id:z.number(),nome:z.string(),observacao_geral:z.string().nullable().optional(),coberturas_na_cotacao:z.array(upstreamCoverage)})}))})});
export function normalizeQuote(raw:unknown, currency:'BRL'|'USD'|'EUR'|null=null) {
  const parsed=upstreamQuote.safeParse(raw);
  if(!parsed.success) throw new VetraError('invalid_response');
  const data=parsed.data.data;
  if(data.empresa&&data.empresa.id!==COMPANY) throw new VetraError('invalid_response');
  return quoteSchema.parse({id:data.id,days:data.vigencia,departure:data.vigencia_inicio,returnDate:data.vigencia_fim,travelers:data.passageiros.length,quotedAt:new Date().toISOString(),currency,plans:data.planos.map(row=>({
    id:row.plano.id,quotePlanId:row.id,name:row.plano.nome,price:row.tarifa!==null&&row.tarifa>=0&&!row.error?row.tarifa:null,available:!row.error&&row.tarifa!==null&&row.tarifa>=0,
    featured:row.destaque??false,bestSeller:row.mais_vendido??false,installments:row.parcela_maxima&&Number.isInteger(row.parcela_maxima)?row.parcela_maxima:null,notes:row.plano.observacao_geral??'',
    coverages:row.plano.coberturas_na_cotacao.filter(c=>c.exibe_na_cotacao!==false).map(c=>({id:c.cobertura_item.id,label:c.cobertura_item.descritivo.trim(),description:c.cobertura_item.resumo??'',included:c.coberto,value:c.valor,currency:c.moeda?.nome==='Dólar'?'US$':c.moeda?.prefixo??''})),
  }))});
}
export async function createQuote(input:QuoteInput) {
  const catalog=await getCatalog();
  if(!catalog.destinations.some(d=>d.id===input.destinationId)||!catalog.tripTypes.some(t=>t.id===input.tripTypeId)) throw new VetraError('invalid_destination',400);
  const exchange=await getExchange();
  const quote=normalizeQuote(await vetraRequest('/cotacao?destaque=1&order=menor_preco',{
    cliente:CLIENT,empresa:COMPANY,servico:1,destino_categorias:{add:[input.destinationId]},vigencia_inicio:input.departure,vigencia_fim:input.returnDate,passageiros:input.ages.map(idade=>({idade})),viagem_tipo:input.tripTypeId,familiar:false,
  }),'USD');
  try{return quoteSchema.parse({...quote,currency:'BRL',exchange,plans:quote.plans.map(plan=>({...plan,priceUsd:plan.price,price:plan.price===null?null:usdToBrl(plan.price,exchange.rate)}))});}
  catch{throw new VetraError('invalid_response');}
}
let exchangeCache:{day:string;expires:number;value:z.infer<typeof exchangeSchema>}|undefined;
export function normalizeExchange(raw:unknown,day:string){
  const parsed=z.object({data:z.object({id:z.number().int().positive(),data:z.string(),cambio_ita:numeric})}).safeParse(raw);
  if(!parsed.success||parsed.data.data.data!==day)throw new VetraError('invalid_response');
  const result=exchangeSchema.safeParse({id:parsed.data.data.id,date:parsed.data.data.data,rate:String(parsed.data.data.cambio_ita),field:'cambio_ita',fetchedAt:new Date().toISOString()});
  if(!result.success)throw new VetraError('invalid_response');
  return result.data;
}
export async function getExchange(){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(exchangeCache?.day===day&&exchangeCache.expires>Date.now())return exchangeCache.value;
  const value=normalizeExchange(await vetraRequest(`/cambio/detail-by-date/${day}?cliente=4`),day);
  exchangeCache={day,expires:Date.now()+5*60*1000,value};return value;
}
// Load these tables on the server only; the provider calculates the final quotation.
export const tableLoaders={
  exchange:()=>vetraRequest('/cambio?cliente=4'),
  agreements:()=>vetraRequest('/tarifa-acordo?cliente=4'),
  plans:(page=1)=>vetraRequest(`/plano/?cliente=4&publicado=1&page=${page}&per_page=100`),
  plan:(id:number)=>vetraRequest(`/plano/${id}?cliente=4`),
};
