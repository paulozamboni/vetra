import { z } from 'zod';
import { quoteInputSchema, quoteSchema } from './quote-contract';
export const CHECKOUT_KEY='vetra:selected-plan:v1';
export const checkoutSelectionSchema=z.object({input:quoteInputSchema,quote:quoteSchema,planId:z.number().int().positive(),summary:z.string(),returnUrl:z.string().refine(s=>s.startsWith('/resultados?'))}).refine(s=>s.quote.currency==='BRL'&&Boolean(s.quote.exchange)&&s.quote.plans.some(p=>p.id===s.planId&&p.available&&p.price!==null),'Atualize a cotação para continuar.');
export type CheckoutSelection=z.infer<typeof checkoutSelectionSchema>;
export function passengerAges(values:string[]) {
  if(values.length<1||values.length>10||values.some(v=>!/^\d{1,3}$/.test(v)||Number(v)>120))return null;
  return values.map(Number);
}
export function quotationAges(values:string[]) {
  return passengerAges(values.map((value,index)=>index>0&&value.trim()===''?values[0]:value));
}
