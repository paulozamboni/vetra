import { z } from 'zod';
import { quoteInputSchema } from './quote-contract';
import { validCpf } from './payment-fields';
import { validPhone, normalizePhone } from './contact';
export const orderInputSchema=z.object({
  requestId:z.string().uuid(),
  input:quoteInputSchema,
  planId:z.number().int().positive(),
  expectedTotal:z.number().positive().max(9999999999.99),
  currency:z.enum(['BRL','USD','EUR']).nullable(),
  customer:z.object({name:z.string().trim().min(3).max(150).refine(v=>v.split(/\s+/).length>=2),email:z.string().trim().email().max(254),phone:z.string().trim().max(25).refine(validPhone).transform(normalizePhone)}).strict(),
  payerEmail:z.string().trim().email().max(254),
  couponCode:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/).optional(),
  expectedDiscountedTotal:z.number().min(0).max(9999999999.99).optional(),
  installments:z.number().int().min(1).max(24).optional(),
  expectedPaymentTotal:z.number().min(0).max(9999999999.99).optional(),
  paymentMethod:z.enum(['pix','card']),
  passengers:z.array(z.object({name:z.string().trim().min(3).max(150).refine(v=>v.split(/\s+/).length>=2),cpf:z.string().max(14).refine(validCpf),age:z.number().int().min(0).max(120)}).strict()).min(1).max(10),
}).strict().superRefine((v,c)=>{
  if(v.couponCode&&v.expectedDiscountedTotal===undefined)c.addIssue({code:'custom',message:'Confira o desconto do cupom.'});
  if(JSON.stringify(v.passengers.map(p=>p.age))!==JSON.stringify(v.input.ages))c.addIssue({code:'custom',message:'Confira as idades.'});
  if(new Set(v.passengers.map(p=>p.cpf.replace(/\D/g,''))).size!==v.passengers.length)c.addIssue({code:'custom',message:'CPFs repetidos.'});
});
export const orderReceiptSchema=z.object({reference:z.string().regex(/^VT-[A-F0-9]{12}$/),status:z.enum(['awaiting_payment','processing','cancelled','paid','issuing','issued','failed','deleted']),total:z.string().regex(/^\d+\.\d{2}$/),currency:z.enum(['BRL','USD','EUR','XXX']),subtotal:z.string().optional(),coupon_code:z.string().optional(),coupon_percent:z.string().optional(),coupon_discount:z.string().optional(),pix_discount_percent:z.string().optional(),pix_discount_amount:z.string().optional(),installment_count:z.number().optional(),installment_interest_percent:z.string().optional(),installment_interest_amount:z.string().optional()});
export type OrderReceipt=z.infer<typeof orderReceiptSchema>;
export function allocateOrderTotal(total:number,count:number){
  const cents=Math.round(total*100);
  return Array.from({length:count},(_,i)=>((Math.floor(cents/count)+(i<cents%count?1:0))/100).toFixed(2));
}
