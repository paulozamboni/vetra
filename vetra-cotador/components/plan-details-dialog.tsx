"use client";
import { useEffect, useState } from 'react';
import { ArrowUpRight, LoaderCircle, Search, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { planDetailsSchema, type PlanDetails, type QuotedPlan } from '@/lib/quote-contract';

const limit=(c:PlanDetails['coverages'][number])=>!c.included?'Não incluída':c.value===null||c.value===0?'Incluída':`${c.currency} ${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(c.value)}`.trim();
export function PlanDetailsDialog({plan}:{plan:QuotedPlan}) {
  const [open,setOpen]=useState(false);
  const [details,setDetails]=useState<PlanDetails|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const [search,setSearch]=useState('');
  useEffect(()=>{
    if(!open||details)return;
    const controller=new AbortController();
    setLoading(true);setError(false);
    fetch(`/api/plans/${plan.id}`,{signal:controller.signal}).then(async r=>{
      if(!r.ok)throw new Error('Unavailable');
      const d=planDetailsSchema.parse(await r.json());
      if(d.id!==plan.id)throw new Error('Invalid plan');
      return d;
    }).then(d=>{if(!controller.signal.aborted)setDetails(d);}).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[open,details,plan.id,attempt]);
  const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const coverages=(details?.coverages??[]).filter(c=>normalize(c.label+' '+c.description).includes(normalize(search)));
  return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(!value)setSearch('');}}>
    <DialogTrigger asChild><button type="button" className="plan-details-trigger">Ver coberturas e condições<ArrowUpRight size={16}/></button></DialogTrigger>
    <DialogContent className="plan-modal" showCloseButton={false}>
      <DialogHeader className="plan-modal-header"><span className="eyebrow">DETALHES DO PLANO</span><DialogTitle>{plan.name}</DialogTitle><DialogDescription>Coberturas, limites e condições informados pela Vetra.</DialogDescription></DialogHeader>
      <DialogClose asChild><button className="plan-modal-close" aria-label="Fechar detalhes"><X size={22}/></button></DialogClose>
      <div className="plan-modal-body">
        {loading&&<div className="modal-status" role="status"><LoaderCircle className="loading-spinner"/>Consultando todas as coberturas…</div>}
        {error&&<div className="modal-status" role="alert"><p>Não conseguimos carregar os detalhes agora.</p><button className="retry-quote" onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></div>}
        {details&&<><div className="coverage-heading"><div><h3>Coberturas do plano</h3><p>{details.coverages.filter(c=>c.included).length} incluídas · {details.coverages.filter(c=>!c.included).length} não incluídas</p></div><label className="coverage-search"><Search size={17}/><input aria-label="Buscar cobertura" placeholder="Buscar cobertura" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
          <div className="coverage-table"><div className="coverage-table-head"><span>Cobertura e descrição</span><span>Limite / inclusão</span></div>{coverages.map(c=><div className={`coverage-row${c.included?'':' coverage-excluded'}`} key={c.id}><div><h4>{c.label}</h4>{c.description.trim()&&c.description.trim()!=="."&&<p>{c.description}</p>}</div><strong>{limit(c)}</strong></div>)}{coverages.length===0&&<p className="modal-status">{details.coverages.length?'Nenhuma cobertura corresponde à busca.':'A API não informou coberturas para este plano.'}</p>}</div>
          <section className="plan-conditions"><h3>Condições do plano</h3>{details.conditions.length>0?<dl>{details.conditions.map(c=><div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}</dl>:<p>A API não informou condições adicionais.</p>}{details.notes&&<p className="plan-provider-note">{details.notes}</p>}<p className="condition-footnote">Os limites acima são por cobertura. Consulte as condições gerais e as exclusões do seguro antes de contratar.</p></section></>}
      </div>
      <div className="plan-modal-footer"><span>{details?`${details.coverages.length} itens consultados na API`:'Consulta de detalhes do plano'}</span><DialogClose asChild><button>Voltar aos planos</button></DialogClose></div>
    </DialogContent>
  </Dialog>;
}
