import {z} from 'zod';
import {serverEnv} from '@/lib/server-env';
import {operationsBase} from '@/lib/operations-base';
import {installmentsResponseSchema} from '@/lib/installment-contract';
const input=z.object({amount:z.number().min(0).max(9999999999.99)}).strict();
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'},fail=(error:string,status=400)=>Response.json({error},{status,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('Origem inválida.',403);
 const text=await request.text();if(text.length>2000)return fail('Dados inválidos.',413);
 let raw;try{raw=JSON.parse(text);}catch{return fail('Dados inválidos.');}
 const parsed=input.safeParse(raw);if(!parsed.success)return fail('Valor inválido.');
 try{const {base,headers:auth}=operationsBase(await serverEnv());const response=await fetch(new URL('/api/checkout/installments/',base),{method:'POST',headers:auth,body:JSON.stringify({subtotal:parsed.data.amount.toFixed(2),currency:'BRL'}),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)return fail('Não foi possível consultar as parcelas. Tente novamente.',503);const data=installmentsResponseSchema.safeParse(await response.json());if(!data.success)return fail('As opções de parcelamento estão indisponíveis.',503);return Response.json(data.data,{headers});}catch{return fail('Não foi possível consultar as parcelas. Tente novamente.',503);}
}
