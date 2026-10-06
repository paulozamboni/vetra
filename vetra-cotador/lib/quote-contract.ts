import { z } from 'zod';
const id = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value;
}, 'Data inválida');
export const quoteInputSchema = z.object({
  destinationId: id,
  departure: date,
  returnDate: date,
  ages: z.array(z.number().int().min(0).max(120)).min(1).max(10),
  tripTypeId: id,
}).strict().superRefine((input, context) => {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(input.departure < today || input.returnDate < input.departure) context.addIssue({code:'custom',message:'Confira as datas da viagem.'});
  if((Date.parse(input.returnDate)-Date.parse(input.departure))/86400000 > 365) context.addIssue({code:'custom',message:'Para viagens acima de 366 dias, fale com a Vetra.'});
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export const catalogSchema = z.object({destinations:z.array(z.object({id,nome:z.string()})),tripTypes:z.array(z.object({id,nome:z.string()}))});
export type Catalog = z.infer<typeof catalogSchema>;
export const coverageSchema = z.object({id,label:z.string(),description:z.string(),included:z.boolean(),value:z.number().nullable(),currency:z.string()});
export const exchangeSchema=z.object({id,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),rate:z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine(v=>Number(v)>0),field:z.literal('cambio_ita'),fetchedAt:z.string().datetime()});
export const quotedPlanSchema = z.object({id,quotePlanId:id,name:z.string(),price:z.number().nonnegative().nullable(),priceUsd:z.number().nonnegative().nullable().optional(),available:z.boolean(),featured:z.boolean(),bestSeller:z.boolean(),installments:z.number().int().positive().nullable(),notes:z.string(),coverages:z.array(coverageSchema)});
export const quoteSchema = z.object({id,days:z.number().int().positive(),departure:z.string(),returnDate:z.string(),travelers:z.number().int().positive(),plans:z.array(quotedPlanSchema),quotedAt:z.string(),currency:z.enum(['BRL','USD','EUR']).nullable(),exchange:exchangeSchema.nullable().optional()});
export type Quote = z.infer<typeof quoteSchema>;
export type QuotedPlan = z.infer<typeof quotedPlanSchema>;
export const planDetailsSchema = z.object({id,name:z.string(),coverages:z.array(coverageSchema),notes:z.string(),conditions:z.array(z.object({label:z.string(),value:z.string()}))});
export type PlanDetails = z.infer<typeof planDetailsSchema>;
