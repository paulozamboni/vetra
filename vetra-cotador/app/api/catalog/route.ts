import { getCatalog, VetraError } from '@/lib/vetra-api';
export async function GET() {
  try { return Response.json(await getCatalog(),{headers:{'Cache-Control':'no-store'}}); }
  catch(error) { console.warn('Vetra catalog unavailable:',error instanceof VetraError?error.code:'unexpected'); return Response.json({error:'Não foi possível carregar os destinos. Tente novamente em instantes.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
