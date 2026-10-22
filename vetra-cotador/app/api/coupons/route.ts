import {z} from 'zod';
import {quoteInputSchema} from '@/lib/quote-contract';
import {createQuote} from '@/lib/vetra-api';
import {serverEnv} from '@/lib/server-env';
import {operationsBase} from '@/lib/operations-base';
const input=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),input:quoteInputSchema,planId:z.number().int().positive(),expectedTotal:z.number().positive()}).strict();
const preview=z.object({code:z.string(),percent:z.string(),subtotal:z.string(),discount:z.string(),total:z.string(),currency:z.literal('BRL')});
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'},fail=(error:string,status=400)=>Response.json({error},{status,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('Origem inválida.',403);
 const text=await request.text();if(text.length>12000)return fail('Dados inválidos.',413);
 let raw;try{raw=JSON.parse(text);}catch{return fail('Dados inválidos.');}
 const parsed=input.safeParse(raw);if(!parsed.success)return fail('Confira o código do cupom e os dados da viagem.');
 try{
  const {base,headers:auth}=operationsBase(await serverEnv());
  const quote=await createQuote(parsed.data.input),plan=quote.plans.find(p=>p.id===parsed.data.planId&&p.available&&p.price!==null);
  if(!plan||quote.currency!=='BRL'||Math.round(plan.price!*100)!==Math.round(parsed.data.expectedTotal*100))return fail('O valor mudou. Atualize a cotação antes de aplicar o cupom.',409);
  const response=await fetch(new URL('/api/checkout/coupons/validate/',base),{method:'POST',headers:auth,body:JSON.stringify({code:parsed.data.code,subtotal:plan.price!.toFixed(2),currency:'BRL'}),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)return fail(response.status===409?'Cupom inválido ou inativo.':'Não foi possível validar o cupom. Tente novamente.',response.status===409?409:503);
  const result=preview.safeParse(await response.json());if(!result.success)return fail('Não foi possível validar o cupom.',503);
  return Response.json(result.data,{headers});
 }catch{return fail('Não foi possível validar o cupom agora. Tente novamente.',503);}
}
