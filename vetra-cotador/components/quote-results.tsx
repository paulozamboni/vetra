"use client";
import { useEffect, useState } from 'react';
import { ShieldCheck, Info, SlidersHorizontal, LoaderCircle } from 'lucide-react';
import { quoteSchema, type Quote, type QuoteInput, type QuotedPlan } from '@/lib/quote-contract';

import { installmentsResponseSchema } from '@/lib/installment-contract';
import { paymentPrices, type PaymentTerms } from '@/lib/payment-prices';
import { CHECKOUT_KEY } from '@/lib/checkout-contract';
import { PlanDetailsDialog } from '@/components/plan-details-dialog';
const amount=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value);
const coverageValue=(coverage:QuotedPlan['coverages'][number])=>!coverage.included?'Não incluída':coverage.value===null||coverage.value===0?'Incluída':`${coverage.currency} ${amount(coverage.value)}`.trim();
export function QuoteResults({ summary, input, edited }: { summary:string; input:QuoteInput|null; edited:boolean }) {
  const [terms,setTerms]=useState<PaymentTerms|null>(null);
  const [termsError,setTermsError]=useState(false);
  const [termsRetry,setTermsRetry]=useState(0);
  const [quote,setQuote]=useState<Quote|null>(null);
  const money=(value:number)=>quote?.currency?new Intl.NumberFormat('pt-BR',{style:'currency',currency:quote.currency}).format(value):amount(value);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [selected,setSelected]=useState<number[]>([]);
  const [comparing,setComparing]=useState(false);
  const [order,setOrder]=useState('price');
  useEffect(()=>{
    setQuote(null);setSelected([]);setComparing(false);setError('');
    if(!input){setLoading(false);return;}
    const controller=new AbortController();
    setLoading(true);
    fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal}).then(async response=>{
      if(!response.ok) throw new Error('Consulta indisponível');
      return quoteSchema.parse(await response.json());
    }).then(value=>{if(!controller.signal.aborted)setQuote(value);}).catch(()=>{if(!controller.signal.aborted)setError('Não conseguimos consultar os planos agora. Tente novamente em instantes.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[input,attempt]);

  useEffect(()=>{
    setTerms(null);setTermsError(false);
    if(!quote||quote.currency!=='BRL')return;
    const controller=new AbortController();
    fetch('/api/installments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount:0}),signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return installmentsResponseSchema.parse(await r.json());}).then(data=>{if(!controller.signal.aborted)setTerms(data);}).catch(()=>{if(!controller.signal.aborted)setTermsError(true);});
    return()=>controller.abort();
  },[quote,termsRetry]);
  const prices=(plan:QuotedPlan)=>plan.price!==null&&terms?paymentPrices(plan.price,terms):null;
  const [selectionError,setSelectionError]=useState('');
  const choosePlan=(plan:QuotedPlan)=>{
    if(!input||!quote||!plan.available||plan.price===null)return;
    try{sessionStorage.setItem(CHECKOUT_KEY,JSON.stringify({input,quote,planId:plan.id,summary,returnUrl:window.location.pathname+window.location.search}));window.location.assign('/compra');}
    catch{setSelectionError('Não foi possível continuar. Verifique se o armazenamento do navegador está disponível e tente novamente.');}
  };
  const plans=[...(quote?.plans??[])].sort((a,b)=>{if(a.price===null)return b.price===null?0:1;if(b.price===null)return -1;return order==='price-desc'?b.price-a.price:a.price-b.price;});
  const compared=plans.filter(plan=>selected.includes(plan.quotePlanId));
  const rows=Array.from(new Map(compared.flatMap(plan=>plan.coverages.map(c=>[c.id,c.label] as const))).entries());
  return <section className="results-section" aria-labelledby="results-title" aria-busy={loading}>
    <div className="results-topline"><div><span className="eyebrow">SUA VIAGEM, SUA ESCOLHA</span><h1 id="results-title">Compare a proteção para sua viagem.</h1><p>{summary||'Preencha o cotador acima para consultar os planos.'}</p></div>{quote&&<span className="preview-badge">{plans.length} opções encontradas</span>}</div>
    {loading&&<div className="results-notice" role="status"><LoaderCircle className="loading-spinner"/><p>Consultando os planos para sua viagem…</p></div>}
    {error&&<div className="results-notice" role="alert"><Info/><p>{error}</p><button className="retry-quote" onClick={()=>setAttempt(value=>value+1)}>Tentar novamente</button></div>}
    {!input&&!loading&&<div className="results-notice" role="status"><Info/><p>{edited?'Você alterou a viagem. Clique em atualizar cotação para consultar os novos valores.':'Escolha destino, datas e viajantes para começar.'}</p></div>}
    {quote&&plans.length===0&&<div className="results-notice" role="status"><Info/><p>Não encontramos planos para essa combinação de destino, período e idades. Ajuste os dados da viagem e consulte novamente.</p></div>}
    {quote&&plans.length>0&&<>
      {!quote.currency&&<div className="results-notice" role="status"><Info/><p>As tarifas abaixo são retornadas pela Vetra. A moeda e as condições de venda estão em confirmação.</p></div>}
      {quote.currency==='BRL'&&termsError&&<div className="results-notice" role="alert"><p>Não foi possível consultar os preços por forma de pagamento.</p><button className="retry-quote" onClick={()=>setTermsRetry(v=>v+1)}>Tentar novamente</button></div>}<div className="results-toolbar"><span><SlidersHorizontal size={17}/>Compare até 3 planos</span><label>Ordenar por <select value={order} onChange={e=>setOrder(e.target.value)}><option value="price">Menor preço</option><option value="price-desc">Maior preço</option></select></label><button disabled={compared.length<2} onClick={()=>setComparing(!comparing)}>{comparing?'Fechar comparação':`Comparar (${compared.length})`}</button></div>
      {comparing&&compared.length>=2&&<div className="comparison-wrap"><table><caption>Preços e coberturas para a sua viagem</caption><thead><tr><th>Informação</th>{compared.map(plan=><th key={plan.quotePlanId}>{plan.name}</th>)}</tr></thead><tbody>{quote.currency==='BRL'?<><tr className="comparison-pix"><th scope="row">Total no Pix</th>{compared.map(plan=><td key={plan.quotePlanId}><strong>{plan.price===null?'Indisponível':prices(plan)?money(prices(plan)!.pix):'Em consulta'}</strong></td>)}</tr><tr><th scope="row">Total no cartão à vista</th>{compared.map(plan=><td key={plan.quotePlanId}>{plan.price===null?'Indisponível':prices(plan)?money(prices(plan)!.card):'Em consulta'}</td>)}</tr></>:<tr><th scope="row">Preço total</th>{compared.map(plan=><td key={plan.quotePlanId}>{plan.price===null?'Indisponível':money(plan.price)}</td>)}</tr>}{rows.map(([id,label])=><tr key={id}><th scope="row">{label}</th>{compared.map(plan=>{const coverage=plan.coverages.find(c=>c.id===id);return <td key={plan.quotePlanId}>{coverage?coverageValue(coverage):'Não informada'}</td>;})}</tr>)}</tbody></table></div>}
      {selectionError&&<p role="alert">{selectionError}</p>}<div className="plan-grid">{plans.map(plan=><article className={selected.includes(plan.quotePlanId)?"plan-card plan-selected":"plan-card"} key={plan.quotePlanId}><div className="plan-top"><span>{plan.featured?'DESTAQUE':plan.bestSeller?'MAIS VENDIDO':'SEGURO VIAGEM'}</span><label><input type="checkbox" checked={selected.includes(plan.quotePlanId)} disabled={!selected.includes(plan.quotePlanId)&&selected.length>=3} onChange={e=>{const next=e.target.checked?[...selected,plan.quotePlanId]:selected.filter(id=>id!==plan.quotePlanId);setSelected(next);if(next.length<2)setComparing(false);}}/>Comparar</label></div><span className="plan-icon"><ShieldCheck size={27}/></span><h2>{plan.name}</h2><p className="plan-subtitle">{quote.days} dias · {quote.travelers} {quote.travelers===1?'viajante':'viajantes'}</p><div className="plan-coverages">{plan.coverages.slice(0,3).map(c=><div key={c.id}><ShieldCheck size={18}/><span>{c.label}<small>{coverageValue(c)}</small></span></div>)}{plan.coverages.length===0&&<p>Consulte as condições completas do plano.</p>}</div><div className="plan-price"><span>Tarifa para todos os viajantes</span>{quote.currency==='BRL'&&plan.price!==null?<>{prices(plan)?<><span className="plan-pix-label">No Pix{prices(plan)!.discountPercent>0&&<b>{prices(plan)!.discountPercent.toLocaleString('pt-BR')}% de desconto</b>}</span><strong className="plan-pix-price">{money(prices(plan)!.pix)}</strong><span className="plan-card-price">ou {money(prices(plan)!.card)} no cartão à vista</span></>:<p role="status">{termsError?'Preços por pagamento indisponíveis':'Calculando preços no Pix e no cartão…'}</p>}</>:<strong>{plan.price===null?'Indisponível':money(plan.price)}</strong>}<small>{plan.available?'Valor para o período completo':'Este plano não pôde ser precificado para sua viagem.'}</small><button className="choose-plan" disabled={!plan.available||plan.price===null} onClick={()=>choosePlan(plan)}>Escolher plano</button></div><div className="plan-details"><PlanDetailsDialog plan={plan}/></div><p className="plan-note">Revise os passageiros e a forma de pagamento na próxima etapa.</p></article>)}</div>
      <p className="results-footnote">Cotação nº {quote.id}. Valores consultados em {new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(quote.quotedAt))}. Confira limites, exclusões e condições antes de contratar.</p>
    </>}
  </section>;
}

