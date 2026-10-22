import {z} from 'zod';
const amount=z.string().regex(/^\d+\.\d{2}$/);
export const installmentSchema=z.object({installments:z.number().int().min(1).max(24),interest_percent:amount,interest_amount:amount,total:amount,installment_amount:amount,principal:amount});
export const pixDiscountSchema=z.object({principal:amount,percent:amount,discount:amount,total:amount});
export type PixDiscount=z.infer<typeof pixDiscountSchema>;
export const installmentsResponseSchema=z.object({options:z.array(installmentSchema).min(1).max(24),pix:pixDiscountSchema,currency:z.literal('BRL')});
export type InstallmentOption=z.infer<typeof installmentSchema>;
