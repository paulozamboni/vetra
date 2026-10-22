"use client";
import { BrandLogo } from './brand-logo';
import { CreditCardFields, PixPaymentFields } from './payment-fields';
import { OrderReceived } from './order-received';
import { CouponField, type CouponPreview } from './coupon-field';
import { PixDiscountPreview, type PixDiscount } from './pix-discount';
import { InstallmentChoices, type InstallmentOption } from './installment-choices';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ShieldCheck, Plus, Trash2, CreditCard, QrCode, Users, CalendarDays, LoaderCircle, CheckCircle2 } from 'lucide-react';
import { CHECKOUT_KEY, checkoutSelectionSchema, passengerAges, quotationAges, type CheckoutSelection } from '@/lib/checkout-contract';
import { quoteSchema, type Quote } from '@/lib/quote-contract';
import { maskCpf, validCpf } from '@/lib/payment-fields';
import { validPhone } from '@/lib/contact';
import { orderReceiptSchema, type OrderReceipt } from '@/lib/order-contract';
import { PlanDetailsDialog } from '@/components/plan-details-dialog';
type Passenger={id:number;name:string;cpf:string;age:string};
export function CheckoutReview(){
  const [selection,setSelection]=useState<CheckoutSelection|null>(null);
  const [ready,setReady]=useState(false);
  const [passengers,setPassengers]=useState<Passenger[]>([]);
  const [quote,setQuote]=useState<Quote|null>(null);
  const [status,setStatus]=useState<'ready'|'loading'|'invalid'|'error'>('loading');
  const [payment,setPayment]=useState<'card'|'pix'>('pix');
  const [customer,setCustomer]=useState({name:'',email:'',phone:''});
  const [payerEmail,setPayerEmail]=useState<string|null>(null);
  const paymentEmail=(payerEmail??customer.email).trim();
  const [sending,setSending]=useState(false);
  const [coupon,setCoupon]=useState<CouponPreview|null>(null);
  const [couponBusy,setCouponBusy]=useState(false);
  const [pixDiscount,setPixDiscount]=useState<PixDiscount|null>(null);
  const [installment,setInstallment]=useState<InstallmentOption|null>(null);
  const [orderError,setOrderError]=useState('');
  const [receipt,setReceipt]=useState<OrderReceipt|null>(null);
  const requestId=useRef('');
  const [cpfTouched,setCpfTouched]=useState<Record<number,boolean>>({});
  const [retry,setRetry]=useState(0);
  const nextId=useRef(1);
  const pricedAges=useRef('');
  useEffect(()=>{
    requestId.current=crypto.randomUUID();
    try {
      const parsed=checkoutSelectionSchema.safeParse(JSON.parse(sessionStorage.getItem(CHECKOUT_KEY)??'null'));
      if(parsed.success){const d=parsed.data;setSelection(d);setQuote(d.quote);setPassengers(d.input.ages.map(age=>({id:nextId.current++,name:'',cpf:'',age:String(age)})));pricedAges.current=JSON.stringify(d.input.ages);setStatus('ready');}
    }catch{}
    setReady(true);
  },[]);
  const ageKey=JSON.stringify(passengers.map(p=>p.age));
  useEffect(()=>{
    if(!selection)return;
    const ages=quotationAges(JSON.parse(ageKey));
    if(!ages){setStatus('invalid');return;}
    if(pricedAges.current===JSON.stringify(ages)&&retry===0){setStatus('ready');return;}
    const controller=new AbortController();setStatus('loading');
    const timer=setTimeout(()=>{
      fetch('/api/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...selection.input,ages}),signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();return quoteSchema.parse(await r.json());}).then(q=>{
        if(controller.signal.aborted)return;
        const p=q.plans.find(p=>p.id===selection.planId);
        if(!p?.available||p.price===null)throw new Error();
        pricedAges.current=JSON.stringify(ages);setQuote(q);setStatus('ready');
      }).catch(()=>{if(!controller.signal.aborted)setStatus('error');});
    },450);
    return()=>{clearTimeout(timer);controller.abort();};
  },[ageKey,selection,retry]);
  const plan=quote?.plans.find(p=>p.id===selection?.planId);
  const actualAges=passengerAges(passengers.map(p=>p.age));
  const estimated=passengers.some((p,i)=>i>0&&p.age.trim()==='');
  const changeAge=(id:number,value:string)=>{setStatus('loading');setPassengers(ps=>ps.map(p=>p.id===id?{...p,age:value}:p));};
  const money=(value:number)=>new Intl.NumberFormat('pt-BR',quote?.currency?{style:'currency',currency:quote.currency}:{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  const paymentPrincipal=coupon?Number(coupon.total):(plan?.price??0);
  const selectedInstallment=installment&&Number(installment.principal)===paymentPrincipal?installment:null;
  const selectedPix=pixDiscount&&Number(pixDiscount.principal)===paymentPrincipal?pixDiscount:null;
  const paymentReady=payment==='pix'?Boolean(selectedPix):Boolean(selectedInstallment);
  const paymentTotal=payment==='card'?(selectedInstallment?Number(selectedInstallment.total):null):(selectedPix?Number(selectedPix.total):null);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(sending||couponBusy||!paymentReady||receipt||status!=='ready'||!selection||!quote||!plan?.available||plan.price===null)return;
    if(!actualAges){setOrderError('Informe a idade real de todos os passageiros antes de enviar o pedido.');return;}
    if(passengers.some(p=>p.name.trim().split(/\s+/).length<2||!validCpf(p.cpf))){setOrderError('Confira o nome completo e o CPF de cada passageiro.');return;}
    setSending(true);setOrderError('');
    try{
      const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current,input:{...selection.input,ages:passengers.map(p=>Number(p.age))},planId:plan.id,expectedTotal:plan.price,currency:quote.currency,customer,payerEmail:paymentEmail,...(coupon?{couponCode:coupon.code,expectedDiscountedTotal:Number(coupon.total)}:{}),installments:payment==='card'?selectedInstallment!.installments:1,expectedPaymentTotal:paymentTotal!,paymentMethod:payment,passengers:passengers.map(p=>({name:p.name,cpf:p.cpf,age:Number(p.age)}))})});
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||'Não conseguimos registrar o pedido. Tente novamente.');
      setReceipt(orderReceiptSchema.parse(data));
    }catch(error){setOrderError(error instanceof Error?error.message:'Não conseguimos registrar o pedido. Tente novamente.');}
    finally{setSending(false);}
  };
  const finalizeButton=<button type="submit" className="confirm-purchase" disabled={status!=='ready'||!actualAges||sending||couponBusy||!paymentReady||Boolean(receipt)}>{!paymentReady?'Calculando pagamento…':couponBusy?'Validando cupom…':sending?'Salvando pedido…':receipt?'Pedido salvo':'Finalizar Pedido'}</button>;
  if(receipt&&plan)return <OrderReceived receipt={receipt} planName={plan.name} customerEmail={customer.email.trim()} payerEmail={paymentEmail} passengers={passengers.length} payment={payment} summary={selection?.summary||''}/>;
  return <div className="checkout-page"><header className="checkout-header"><a href="/" className="checkout-logo" aria-label="Vetra, início"><BrandLogo /></a><span>SEGURO VIAGEM</span><div><ShieldCheck size={18}/>Revise com tranquilidade</div></header>
    <main className="checkout-main">
      {!ready?<div className="checkout-empty" role="status">Carregando o plano escolhido…</div>:!selection||!plan?<div className="checkout-empty"><h1>Escolha seu plano para continuar</h1><p>Faça uma cotação e selecione o seguro para sua viagem.</p><a href="/">Voltar ao cotador</a></div>:<>
        <a href={selection.returnUrl} className="checkout-back">Voltar aos planos</a>
        <div className="checkout-heading"><span className="eyebrow">SEU SEGURO VIAGEM</span><h1>Revise seu seguro viagem.</h1><p>Confira o plano e quem vai viajar com você.</p><ol aria-label="Etapas do pedido"><li className="completed"><CheckCircle2 size={18}/>Plano escolhido</li><li aria-current="step"><span>2</span>Dados do pedido</li><li><span>3</span>Confirmação</li></ol></div>
<div aria-live="polite">{receipt&&<section className="checkout-panel"><h2>Pedido {receipt.reference}</h2><p>Seus dados foram salvos. A equipe Vetra já pode acompanhar este pedido, que aguarda pagamento. Nenhuma cobrança ou apólice foi gerada.</p></section>}</div>
        <form className="checkout-layout" onSubmit={submit}><fieldset disabled={sending||Boolean(receipt)} style={{display:"contents"}}>
          <div className="checkout-content"><section className="checkout-panel"><div className="checkout-section-heading"><span className="checkout-section-icon"><Users/></span><div><h2>Quem está fazendo o pedido?</h2><p>Informe o contato para acompanhar sua solicitação.</p></div></div><div className="customer-contact-fields"><label>Nome completo<input required minLength={3} maxLength={150} autoComplete="name" aria-label="Nome do responsável pelo pedido" value={customer.name} onChange={e=>setCustomer(c=>({...c,name:e.target.value}))}/></label><label>E-mail<input required type="email" maxLength={254} autoComplete="email" aria-label="E-mail do responsável pelo pedido" value={customer.email} onChange={e=>setCustomer(c=>({...c,email:e.target.value}))}/></label><label>Telefone<input required type="tel" autoComplete="tel" inputMode="tel" minLength={10} maxLength={25} aria-label="Telefone do responsável pelo pedido" placeholder="(11) 99999-9999" value={customer.phone} onChange={e=>{const value=e.target.value;setCustomer(c=>({...c,phone:value}));e.currentTarget.setCustomValidity(validPhone(value)?'':'Informe um telefone com DDD, de 10 a 15 dígitos.');}}/></label></div></section>
            <section className="checkout-panel chosen-plan"><div className="checkout-section-heading"><span className="checkout-section-icon"><ShieldCheck/></span><div><span className="eyebrow">PLANO ESCOLHIDO</span><h2>{plan.name}</h2></div></div><p>{selection.summary.split(' · ').slice(0,3).join(' · ')}</p><div className="chosen-plan-meta"><span><CalendarDays size={17}/>{quote?.days} dias de proteção</span><span><Users size={17}/>{passengers.length} {passengers.length===1?'passageiro':'passageiros'}</span></div><PlanDetailsDialog plan={plan}/></section>
            <section className="checkout-panel"><div className="checkout-section-heading"><span className="checkout-section-number">1</span><div><h2>Quem vai viajar?</h2><p>Informe nome completo, CPF e idade na data de embarque.</p></div></div>
              <div className="checkout-passengers">{passengers.map((p,i)=><fieldset className="checkout-passenger" key={p.id}><legend>Passageiro {i+1}</legend><div className="passenger-fields"><label>Nome completo<input required minLength={2} maxLength={120} autoComplete="off" aria-label={`Nome completo do passageiro ${i+1}`} placeholder="Como está no documento" value={p.name} onChange={e=>setPassengers(ps=>ps.map(row=>row.id===p.id?{...row,name:e.target.value}:row))}/></label><label className="passenger-cpf">CPF<input required autoComplete="off" inputMode="numeric" maxLength={14} aria-label={`CPF do passageiro ${i+1}`} placeholder="000.000.000-00" value={p.cpf} aria-invalid={Boolean(cpfTouched[p.id]&&!validCpf(p.cpf))} aria-describedby={cpfTouched[p.id]&&!validCpf(p.cpf)?`cpf-error-${p.id}`:undefined} onInvalid={()=>setCpfTouched(t=>({...t,[p.id]:true}))} onBlur={()=>setCpfTouched(t=>({...t,[p.id]:true}))} onChange={e=>{const value=maskCpf(e.target.value);e.currentTarget.setCustomValidity(validCpf(value)?'':'Informe um CPF válido.');setPassengers(ps=>ps.map(row=>row.id===p.id?{...row,cpf:value}:row));}}/>{cpfTouched[p.id]&&!validCpf(p.cpf)&&<small className="field-error" id={`cpf-error-${p.id}`}>Confira os 11 dígitos do CPF.</small>}</label><label className="passenger-age">Idade<input required type="number" min={0} max={120} step={1} inputMode="numeric" aria-label={`Idade do passageiro ${i+1}`} placeholder="Anos" value={p.age} onChange={e=>changeAge(p.id,e.target.value)}/></label>{passengers.length>1&&<button type="button" className="remove-passenger" aria-label={`Remover passageiro ${i+1}`} onClick={()=>{setStatus('loading');setPassengers(ps=>ps.filter(row=>row.id!==p.id));}}><Trash2 size={18}/></button>}</div></fieldset>)}</div>
              <button type="button" className="add-passenger" disabled={passengers.length>=10} onClick={()=>{setStatus('loading');setPassengers(ps=>[...ps,{id:nextId.current++,name:'',cpf:'',age:''}]);}}><Plus size={18}/>Adicionar passageiro</button><p className="checkout-helper">Até 10 passageiros. Enquanto a idade estiver em branco, estimamos o valor usando a idade do primeiro passageiro. Ao preencher, recalculamos automaticamente.</p>
            </section>
            <section className="checkout-panel"><div className="checkout-section-heading"><span className="checkout-section-number">2</span><div><h2>Forma de pagamento</h2><p>Escolha como prefere pagar. Confira abaixo a prévia de cada opção.</p></div></div><fieldset className="payment-options"><legend className="sr-only">Forma de pagamento</legend><label className={payment==='card'?'payment-option selected':'payment-option'}><input type="radio" name="payment" value="card" checked={payment==='card'} onChange={()=>setPayment('card')}/><CreditCard/><span><strong>Cartão de crédito</strong><small>Confira os campos do cartão</small></span></label><label className={payment==='pix'?'payment-option selected':'payment-option'}><input type="radio" name="payment" value="pix" checked={payment==='pix'} onChange={()=>setPayment('pix')}/><QrCode/><span><strong>Pix</strong><small>QR Code e copia e cola</small></span></label></fieldset><div className="payer-email-section"><label className="payer-email-field">E-mail do pagador<input required type="email" autoComplete="email" maxLength={254} value={payerEmail??customer.email} onChange={e=>setPayerEmail(e.target.value)} placeholder="pagador@exemplo.com" aria-describedby="payer-email-help"/></label><p id="payer-email-help">Contato para acompanhar o pagamento por {payment==='card'?'cartão':'Pix'}. A apólice será enviada ao e-mail do responsável pelo pedido.</p></div>{payment==='card'?<CreditCardFields><InstallmentChoices amount={paymentPrincipal} disabled={status!=='ready'||couponBusy||sending} onChange={setInstallment}/></CreditCardFields>:<><PixDiscountPreview amount={paymentPrincipal} onChange={setPixDiscount}/><PixPaymentFields total={status==='ready'&&paymentTotal!==null?money(paymentTotal):undefined}/></>}<div className="checkout-payment-submit">{orderError&&<p className="field-error" role="alert">{orderError}</p>}{finalizeButton}</div></section>
          </div>
          <aside className="checkout-summary"><span className="eyebrow">RESUMO DO PEDIDO</span><h2>{plan.name}</h2><p>{selection.summary.split(' · ')[0]}</p><dl><div><dt>Período</dt><dd>{quote?.days} dias</dd></div><div><dt>Passageiros</dt><dd>{passengers.length}</dd></div><div><dt>Pagamento</dt><dd>{payment==='card'?'Cartão de crédito':'Pix'}</dd></div>{payment==='card'&&selectedInstallment&&<div><dt>Parcelamento</dt><dd>{selectedInstallment.installments===1?'À vista':selectedInstallment.installments+'x de '+money(Number(selectedInstallment.installment_amount))}</dd></div>}</dl><CouponField input={selection&&actualAges?{...selection.input,ages:actualAges}:null} planId={plan.id} subtotal={plan.price??0} disabled={status!=='ready'||sending||Boolean(receipt)} onChange={setCoupon} onBusyChange={setCouponBusy}/>{coupon&&<dl className="coupon-summary"><div><dt>Valor da compra</dt><dd>{money(Number(coupon.subtotal))}</dd></div><div><dt>Desconto ({coupon.code})</dt><dd>− {money(Number(coupon.discount))}</dd></div></dl>}{payment==='card'&&selectedInstallment&&Number(selectedInstallment.interest_amount)>0&&<dl className="coupon-summary">{!coupon&&<div><dt>Valor da compra</dt><dd>{money(paymentPrincipal)}</dd></div>}<div><dt>Juros do parcelamento</dt><dd>+ {money(Number(selectedInstallment.interest_amount))}</dd></div></dl>}{payment==='pix'&&selectedPix&&Number(selectedPix.discount)>0&&<dl className="coupon-summary">{!coupon&&<div><dt>Valor da compra</dt><dd>{money(paymentPrincipal)}</dd></div>}<div><dt>Desconto Pix ({Number(selectedPix.percent).toLocaleString('pt-BR')}%)</dt><dd>− {money(Number(selectedPix.discount))}</dd></div></dl>}<div className="checkout-total" aria-live="polite"><span>Total para a viagem</span><strong>{status==='ready'&&plan.price!==null?(paymentTotal!==null?money(paymentTotal):'—'):'—'}</strong><small>{status==='ready'?(estimated?'Valor estimado usando a idade do primeiro passageiro. Informe as idades reais para enviar o pedido.':'Para todos os passageiros e o período completo'):status==='loading'?'Atualizando o valor…':status==='invalid'?'Informe idades válidas para todos os passageiros':'Não foi possível atualizar o valor.'}</small></div>{status==='loading'&&<p className="checkout-helper" role="status"><LoaderCircle size={16} className="loading-spinner"/>Consultando a Vetra…</p>}{status==='error'&&<div role="alert"><p>O plano pode não estar disponível para estas idades. Confira os dados ou tente novamente.</p><button type="button" className="retry-quote" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></div>}{!quote?.currency&&<p className="checkout-helper">Moeda da tarifa em confirmação com a Vetra.</p>}{orderError&&<p className="field-error" role="alert">{orderError}</p>}<button type="button" className="retry-quote" disabled={sending||Boolean(receipt)} onClick={()=>setRetry(n=>n+1)}>Atualizar o valor</button>{finalizeButton}<p className="checkout-phase-note">Ao salvar, seus dados, passageiros e plano ficam registrados para acompanhamento pela equipe Vetra. Nenhum pagamento ou apólice será gerado nesta etapa.</p></aside>
        </fieldset></form>

      </>}
    </main><footer className="checkout-footer">Vetra · Seguro viagem</footer>
  </div>;
}
