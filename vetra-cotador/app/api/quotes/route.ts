import { quoteInputSchema } from '@/lib/quote-contract';
import { createQuote, VetraError } from '@/lib/vetra-api';
export async function POST(request:Request) {
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin) return Response.json({error:'Origem inválida.'},{status:403});
  const declared=Number(request.headers.get('content-length')??0);
  if(declared>4096) return Response.json({error:'Dados inválidos.'},{status:413});
  const text=await request.text();
  if(text.length>4096) return Response.json({error:'Dados inválidos.'},{status:413});
  let body; try { body=JSON.parse(text); } catch { return Response.json({error:'Dados inválidos.'},{status:400}); }
  const parsed=quoteInputSchema.safeParse(body);
  if(!parsed.success) return Response.json({error:'Confira o destino, as datas e as idades dos viajantes.'},{status:400});
  try { return Response.json(await createQuote(parsed.data),{headers:{'Cache-Control':'no-store'}}); }
  catch(error) { const invalid=error instanceof VetraError&&error.status===400;return Response.json({error:invalid?'Selecione um destino e tipo de viagem disponíveis.':'Não conseguimos consultar os planos agora. Tente novamente em instantes.'},{status:invalid?400:503,headers:{'Cache-Control':'no-store'}}); }
}
