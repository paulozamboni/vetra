"use client";
import { useEffect, useRef } from 'react';
import { CheckCircle2, Mail, ClipboardCheck, ShieldCheck, ArrowRight } from 'lucide-react';
import { BrandLogo } from './brand-logo';
import type { OrderReceipt } from '@/lib/order-contract';
type Props={receipt:OrderReceipt;planName:string;customerEmail:string;payerEmail:string;passengers:number;payment:'card'|'pix';summary:string};
export function OrderReceived({receipt,planName,customerEmail,payerEmail,passengers,payment,summary}:Props){
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{document.title='Pedido recebido | Vetra Seguros';heading.current?.focus();window.scrollTo({top:0,behavior:'instant'});},[]);
  const total=new Intl.NumberFormat('pt-BR',{style:'currency',currency:receipt.currency==='XXX'?'BRL':receipt.currency}).format(Number(receipt.total));
  return <div className="checkout-page"><header className="checkout-header"><a href="/" className="checkout-logo" aria-label="Vetra, início"><BrandLogo/></a><span>SEGURO VIAGEM</span><div><ShieldCheck size={18}/>Vá tranquilo.</div></header>
    <main className="order-received-page"><section className="order-received-card" aria-labelledby="received-title"><span className="order-received-check"><CheckCircle2 size={38}/></span><span className="eyebrow">TUDO CERTO COM O SEU PEDIDO</span><h1 id="received-title" ref={heading} tabIndex={-1}>Pedido recebido!</h1><p className="received-intro">Recebemos seus dados. Agora a equipe Vetra vai acompanhar o seu pedido.</p>
      <div className="received-reference"><span>Número do pedido</span><strong>{receipt.reference}</strong><small>Guarde este número para acompanhar seu atendimento.</small></div>
      <div className="received-email"><Mail size={24}/><div><h2>Sua apólice no e-mail</h2><p>Após a confirmação do pagamento e o processamento do pedido, você receberá a apólice em <strong>{customerEmail}</strong>.</p></div></div>
      <dl className="received-summary"><div><dt>Plano escolhido</dt><dd>{planName}</dd></div><div><dt>Viagem</dt><dd>{summary.split(' · ').slice(0,3).join(' · ')}</dd></div><div><dt>Passageiros</dt><dd>{passengers} {passengers===1?'passageiro':'passageiros'}</dd></div><div><dt>Forma de pagamento</dt><dd>{payment==='card'?'Cartão de crédito · '+((receipt.installment_count||1)===1?'à vista':receipt.installment_count+' parcelas'):'Pix'}</dd></div><div><dt>E-mail do pagador</dt><dd>{payerEmail}</dd></div>{receipt.coupon_code&&<div><dt>Cupom aplicado</dt><dd>{receipt.coupon_code} · {receipt.coupon_percent}% de desconto</dd></div>}<div className="received-total"><dt>Total do pedido</dt><dd>{receipt.currency==='XXX'?Number(receipt.total).toFixed(2)+' · moeda a confirmar':total}</dd></div></dl>
      <div className="received-next"><ClipboardCheck size={20}/><div><h2>O que acontece agora?</h2><p>A equipe confere seus dados e acompanha as próximas etapas. O recebimento do pedido ainda não confirma pagamento ou emissão da apólice.</p></div></div>
      <a href="/" className="received-home">Voltar ao início<ArrowRight size={18}/></a>
    </section></main><footer className="checkout-footer">Vetra Seguros · Vá tranquilo.</footer></div>;
}
