import { orderInputSchema, orderReceiptSchema, allocateOrderTotal } from '@/lib/order-contract';
import { createQuote, getCatalog } from '@/lib/vetra-api';
import { serverEnv } from '@/lib/server-env';
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store'};
  const fail=(error:string,status=503)=>Response.json({error},{status,headers});
  if(request.headers.get('origin')!==new URL(request.url).origin)return fail('Origem inválida.',403);
  if(Number(request.headers.get('content-length')??0)>12000)return fail('Dados inválidos.',413);
  const text=await request.text();if(text.length>12000)return fail('Dados inválidos.',413);
  let raw;try{raw=JSON.parse(text);}catch{return fail('Dados inválidos.',400);}
  const parsed=orderInputSchema.safeParse(raw);
  if(!parsed.success)return fail('Confira nome completo, e-mail, CPF, datas e idades. Cada passageiro deve ter um CPF diferente.',400);
  const env=await serverEnv();
  if(!env.VETRA_OPERATIONS_URL||!env.VETRA_OPERATIONS_TOKEN)return fail('O envio de pedidos está temporariamente indisponível. Seus dados continuam nesta página.');
  try{
    const base=new URL(env.VETRA_OPERATIONS_URL);
    const local=['127.0.0.1','localhost'].includes(base.hostname);
    const dockerInternal=env.VETRA_DEPLOY_TARGET==='node'&&base.origin==='http://operations:8080';
    if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||base.protocol!=='https:'&&!(base.protocol==='http:'&&(local||dockerInternal)))return fail('O envio de pedidos está indisponível.');
    const data=parsed.data;
    // The browser cannot choose the plan name, destination, tariff or financial status.
    const [quote,catalog]=await Promise.all([createQuote(data.input),getCatalog()]);
    const plan=quote.plans.find(p=>p.id===data.planId&&p.available&&p.price!==null);
    const destination=catalog.destinations.find(d=>d.id===data.input.destinationId);
    if(!plan||!destination||quote.currency!==data.currency||!quote.exchange||plan.priceUsd==null)return fail('O plano ou a moeda mudou. Atualize a cotação antes de enviar.',409);
    if(Math.round(plan.price!*100)!==Math.round(data.expectedTotal*100))return fail('O valor mudou. Clique em atualizar o valor e confira o novo total antes de enviar.',409);
    const prices=allocateOrderTotal(plan.price!,data.passengers.length);
    const response=await fetch(new URL('/api/checkout/orders/',base),{method:'POST',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.VETRA_OPERATIONS_TOKEN,...(dockerInternal?{'X-Forwarded-Proto':'https'}:{})},body:JSON.stringify({request_id:data.requestId,order:{customer_name:data.customer.name,customer_email:data.customer.email,destination:destination.nome,plan_id:plan.id,vetra_quote_id:quote.id,vetra_quote_plan_id:plan.quotePlanId,plan_name:plan.name,departure:data.input.departure,return_date:data.input.returnDate,currency:'BRL',original_currency:'USD',original_total:plan.priceUsd.toFixed(6),exchange_rate:quote.exchange.rate,exchange_date:quote.exchange.date,exchange_id:quote.exchange.id,exchange_field:quote.exchange.field,exchange_fetched_at:quote.exchange.fetchedAt,payment_method:data.paymentMethod,passengers:data.passengers.map((p,i)=>({full_name:p.name,cpf:p.cpf,age:p.age,unit_price:prices[i]}))}})});
    if(!response.ok){console.warn('Operations order response:',response.status);return fail(response.status===409?'Este envio já foi registrado com outros dados. Confira o pedido antes de enviar novamente.':'Não conseguimos registrar o pedido. Tente novamente; o mesmo envio não cria outro pedido.',response.status===409?409:503);}
    const receipt=orderReceiptSchema.safeParse(await response.json());
    if(!receipt.success)return fail('Não conseguimos confirmar o envio. Tente novamente com os mesmos dados.');
    return Response.json(receipt.data,{status:response.status,headers});
  }catch(error){console.warn('Operations transport:',error instanceof Error?error.name:'failed');return fail('Não conseguimos registrar o pedido agora. Tente novamente; seus dados continuam nesta página.');}
}
