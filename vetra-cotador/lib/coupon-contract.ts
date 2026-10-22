import {z} from 'zod';
const amount=z.string().regex(/^\d+\.\d{2}$/);
export const couponPreviewSchema=z.object({code:z.string().regex(/^[A-Z0-9_-]{3,32}$/),percent:amount.refine(v=>Number(v)>0&&Number(v)<=100),subtotal:amount,discount:amount,total:amount,currency:z.literal('BRL')});
export type CouponPreview=z.infer<typeof couponPreviewSchema>;
