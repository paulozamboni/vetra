"use client";
import {useEffect,useState} from 'react';
import {installmentsResponseSchema,type PixDiscount} from '@/lib/installment-contract';
export type {PixDiscount} from '@/lib/installment-contract';
const money=(v:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v));
export function PixDiscountPreview({amount,onChange}:{amount:number;onChange:(value:PixDiscount|null)=>void}){
 const [value,setValue]=useState<PixDiscount|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();onChange(null);setValue(null);setError(false);
 fetch('/api/installments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount}),signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return installmentsResponseSchema.parse(await r.json());}).then(data=>{if(!controller.signal.aborted){setValue(data.pix);onChange(data.pix);}}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[amount,retry,onChange]);
 return <div className="pix-discount-preview" aria-live="polite">{error?<><p role="alert">Não foi possível consultar o desconto Pix.</p><button type="button" className="retry-quote" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button></>:!value?<p role="status">Calculando o valor no Pix…</p>:Number(value.discount)>0?<><strong>{Number(value.percent).toLocaleString('pt-BR')}% de desconto no Pix</strong><p>Você economiza {money(value.discount)}{'. '}Total no Pix: <b>{money(value.total)}</b>.</p></>:<p>Pix à vista: <strong>{money(value.total)}</strong></p>}</div>;
}
