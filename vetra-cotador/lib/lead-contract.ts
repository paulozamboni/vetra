import {z} from 'zod';
import {validPhone,normalizePhone} from './contact';
export const leadInputSchema=z.object({
 requestId:z.string().uuid(),
 name:z.string().trim().min(1).max(150),
 email:z.string().trim().email().max(254),
 phone:z.string().trim().max(25).refine(validPhone).transform(normalizePhone),
 quoteId:z.string().max(80),
 summary:z.string().max(500),
 minQuoteTotal:z.number().finite().min(0).max(9999999999.99).optional(),
 travelers:z.number().int().min(1).max(10).optional(),
}).strict().refine(v=>(v.minQuoteTotal!==undefined)===(v.travelers!==undefined));

export const leadReceiptSchema=z.object({received:z.literal(true)});
