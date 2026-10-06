"use client";
import { useEffect, useState } from 'react';
import { ptBR } from 'react-day-picker/locale';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
const asDate=(value:string)=>new Date(value+'T12:00:00');
const asISO=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const label=(value:string)=>value?value.split('-').reverse().join('/'):'Selecione no calendário';
const days=(start:string,end:string)=>Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
export function TravelDateRange({departure,returnDate,today,onChange,onConfirm,onClose}:{departure:string;returnDate:string;today:string;onChange:(start:string,end:string)=>void;onConfirm:()=>void;onClose:()=>void}){
  const [months,setMonths]=useState(2);
  const [error,setError]=useState('');
  useEffect(()=>{const query=window.matchMedia('(max-width:999px)');const update=()=>setMonths(query.matches?1:2);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
  const ready=!!departure&&!!returnDate&&departure>=today&&returnDate>=departure&&days(departure,returnDate)<=366;
  function select(day:Date){
    const value=asISO(day);setError('');
    if(value<today)return;
    if(!departure||returnDate||value<departure){onChange(value,'');return;}
    if(days(departure,value)>366){setError('Selecione um período de até 366 dias.');return;}
    onChange(departure,value);
  }
  return <div className="popover dates-popover range-popover" id="dates-panel" role="dialog" aria-labelledby="dates-title"><div className="popover-heading"><h3 id="dates-title">Datas da sua viagem</h3><button type="button" onClick={onClose} aria-label="Fechar datas"><X size={18}/></button></div><p>Inclua o embarque no Brasil e o desembarque no Brasil no retorno.</p><div className="range-date-summary"><div className={!departure?'range-date-active':''}><span>Embarque no Brasil</span><strong>{label(departure)}</strong></div><div className={departure&&!returnDate?'range-date-active':''}><span>Desembarque no Brasil</span><strong>{label(returnDate)}</strong></div></div><div className="calendar-navigation-hint">Use as setas para mudar de mês.</div><Calendar className="travel-range-calendar" mode="range" locale={ptBR} numberOfMonths={months} defaultMonth={asDate(departure||today)} startMonth={asDate(today)} selected={departure?{from:asDate(departure),to:returnDate?asDate(returnDate):undefined}:undefined} onSelect={(_,day)=>select(day)} disabled={{before:asDate(today)}} showOutsideDays={false} autoFocus labels={{labelPrevious:()=> 'Mês anterior',labelNext:()=> 'Próximo mês'}}/><div className="range-status" aria-live="polite">{error?<p role="alert">{error}</p>:ready?<span className="duration"><Check size={15}/>{days(departure,returnDate)} {days(departure,returnDate)===1?'dia':'dias'} de viagem, incluindo embarque e desembarque</span>:<p>{departure?'Agora selecione o desembarque no Brasil.':'Selecione primeiro o embarque no Brasil.'}</p>}</div><Button type="button" className="confirm" onClick={onConfirm} disabled={!ready}>Confirmar período</Button></div>;
}
