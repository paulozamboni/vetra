import { getPlanDetails, VetraError } from '@/lib/vetra-api';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  if(!/^[1-9]\d{0,8}$/.test(id))return Response.json({error:'Plano não encontrado.'},{status:404});
  try {return Response.json(await getPlanDetails(Number(id)),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return Response.json({error:'Não foi possível consultar as coberturas do plano.'},{status:error instanceof VetraError?error.status:503});}
}
