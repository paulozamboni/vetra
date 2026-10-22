import type {z} from 'zod';
import type {installmentsResponseSchema} from './installment-contract';
export type PaymentTerms=z.infer<typeof installmentsResponseSchema>;
export function paymentPrices(value:number,terms:PaymentTerms){
 const cents=BigInt(value.toFixed(2).replace('.',''));
 const apply=(percent:string)=>{const rate=BigInt(percent.replace('.',''));return (cents*rate+BigInt(5000))/BigInt(10000);};
 const pix=cents-apply(terms.pix.percent);
 const card=cents+apply(terms.options.find(o=>o.installments===1)?.interest_percent??'0.00');
 return {pix:Number(pix)/100,card:Number(card)/100,discountPercent:Number(terms.pix.percent)};
}
