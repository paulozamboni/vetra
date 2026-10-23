import {leadCookies,setLeadCookies} from '@/lib/lead-cookies';
import {leadInputSchema,leadReceiptSchema} from '@/lib/lead-contract';
import {operationsBase} from '@/lib/operations-base';
import {serverEnv} from '@/lib/server-env';
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 const fail=(error:string,status=400)=>Response.json({error},{status,headers});
 const env=await serverEnv();
 const url=new URL(request.url);
 // Node standalone is served behind the configured HTTPS reverse proxy.
 const host=request.headers.get('x-forwarded-host');
 const origin=env.VETRA_DEPLOY_TARGET==='node'&&host&&request.headers.get('x-forwarded-proto')==='https'?'https://'+host:url.origin;
 if(request.headers.get('origin')!==origin)return fail('Origem inválida.',403);
 const text=await request.text();if(text.length>5000)return fail('Dados inválidos.',413);
 let raw;try{raw=JSON.parse(text);}catch{return fail('Dados inválidos.');}
 const input=leadInputSchema.safeParse(raw);if(!input.success)return fail('Confira seu nome, e-mail e telefone com DDD.');
 try{
  const {base,headers:auth}=operationsBase(env),data=input.data;
  const {visitorId}=leadCookies(request);
  const r=await fetch(new URL('/api/checkout/leads/',base),{method:'POST',headers:auth,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000),body:JSON.stringify({request_id:data.requestId,visitor_id:visitorId,name:data.name,email:data.email,phone:data.phone,quote_id:data.quoteId,trip_summary:data.summary,...(data.minQuoteTotal!==undefined?{min_quote_total:data.minQuoteTotal.toFixed(2),traveler_count:data.travelers}:{})})});
  if(!r.ok)return fail('Não conseguimos salvar seus dados. Tente novamente.',r.status===409?409:503);
  const result=leadReceiptSchema.safeParse(await r.json());if(!result.success)return fail('Não conseguimos confirmar o recebimento. Tente novamente.',503);
  const responseHeaders=new Headers(headers);setLeadCookies(responseHeaders,visitorId,origin.startsWith('https:'));
  return Response.json({received:true},{status:201,headers:responseHeaders});
 }catch{return fail('Não conseguimos salvar seus dados. Tente novamente.',503);}
}
