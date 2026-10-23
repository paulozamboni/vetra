import {z} from 'zod';
import {operationsBase} from '@/lib/operations-base';
import {serverEnv} from '@/lib/server-env';
import {leadCookies,setLeadCookies} from '@/lib/lead-cookies';
const schema=z.object({requestId:z.string().uuid(),quoteId:z.string().max(80),summary:z.string().max(500),minQuoteTotal:z.number().finite().min(0).max(9999999999.99).optional(),travelers:z.number().int().min(1).max(10).optional(),offerCapture:z.boolean()}).strict().refine(v=>(v.minQuoteTotal!==undefined)===(v.travelers!==undefined));
export async function POST(request:Request){
 const env=await serverEnv(),url=new URL(request.url),host=request.headers.get('x-forwarded-host');
 const origin=env.VETRA_DEPLOY_TARGET==='node'&&host&&request.headers.get('x-forwarded-proto')==='https'?'https://'+host:url.origin;
 const headers=new Headers({'Cache-Control':'no-store'});
 if(request.headers.get('origin')!==origin)return Response.json({error:'Origem inválida.'},{status:403,headers});
 const text=await request.text();if(text.length>5000)return Response.json({error:'Dados inválidos.'},{status:413,headers});
 let raw;try{raw=JSON.parse(text);}catch{return Response.json({error:'Dados inválidos.'},{status:400,headers});}
 const input=schema.safeParse(raw);if(!input.success)return Response.json({error:'Dados inválidos.'},{status:400,headers});
 const data=input.data,{visitorId}=leadCookies(request);
 let recorded=false,knownLead=false;
 try{const {base,headers:auth}=operationsBase(env);const r=await fetch(new URL('/api/checkout/lead-searches/',base),{method:'POST',headers:auth,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000),body:JSON.stringify({request_id:data.requestId,visitor_id:visitorId,quote_id:data.quoteId,trip_summary:data.summary,...(data.minQuoteTotal!==undefined?{min_quote_total:data.minQuoteTotal.toFixed(2),traveler_count:data.travelers}:{})})});if(r.ok){const result=await r.json() as {received?:unknown;known_lead?:unknown};recorded=result.received===true;knownLead=recorded&&result.known_lead===true;}}catch{}
 setLeadCookies(headers,visitorId,origin.startsWith('https:'),knownLead);
 return Response.json({showCapture:!knownLead&&data.offerCapture,recorded},{headers});
}
