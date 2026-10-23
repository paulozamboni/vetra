"use client";
import {useEffect,useRef,useState} from 'react';
import {LeadCaptureDialog} from './lead-capture-dialog';
export function LeadSearchCapture({quoteId,summary,minQuoteTotal,travelers,offerCapture}:{quoteId:string;summary:string;minQuoteTotal?:number;travelers?:number;offerCapture:boolean}){
 const [show,setShow]=useState(false);
 const pending=useRef<Promise<boolean>|null>(null);
 useEffect(()=>{let active=true;
 if(!pending.current)pending.current=fetch('/api/leads/searches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),quoteId,summary:summary.slice(0,500),...(minQuoteTotal!==undefined&&travelers!==undefined?{minQuoteTotal,travelers}:{}),offerCapture})}).then(async r=>{if(!r.ok)return false;const data=await r.json() as {showCapture?:unknown};return data.showCapture===true;}).catch(()=>false);
 pending.current.then(value=>{if(active)setShow(value);});return()=>{active=false;};
 },[quoteId,summary,minQuoteTotal,travelers,offerCapture]);
 return show?<LeadCaptureDialog quoteId={quoteId} summary={summary} minQuoteTotal={minQuoteTotal} travelers={travelers}/>:null;
}
