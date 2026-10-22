"use client";
import { useState, type ReactNode } from 'react';
import { CreditCard, QrCode, Copy, Info, LockKeyhole, Smartphone, Clock3, ShieldCheck } from 'lucide-react';
import { digits, isAmex, maskCardNumber, maskExpiry } from '@/lib/payment-fields';

// Visual preview only. Gateway fields/tokenization replace these local inputs at integration.
// No field names, persistence, payment requests or card details in the order payload.
export function CreditCardFields({children}:{children?:ReactNode}){
  const [number,setNumber]=useState('');
  const [holder,setHolder]=useState('');
  const [expiry,setExpiry]=useState('');
  const [cvv,setCvv]=useState('');
  return <div className="payment-details credit-card-details">
    <div className="payment-detail-heading"><CreditCard size={22}/><div><h3>Dados do cartão</h3><p>Veja como será o preenchimento do pagamento.</p></div><span className="payment-preview-badge">Prévia</span></div>
    <p className="payment-interface-note"><Info size={17}/><span>Interface em demonstração. Use apenas dados fictícios. Nenhuma cobrança será realizada.</span></p>
    <div className="card-preview-layout">
      <div className="payment-card-preview" aria-hidden="true"><div className="payment-card-top"><span>VETRA SEGUROS</span><CreditCard size={27}/></div><div className="payment-card-chip"/><div className="payment-card-number">•••• •••• •••• {digits(number).slice(-4).padStart(4,'•')}</div><div className="payment-card-bottom"><div><small>TITULAR</small><span>{holder.trim()||'SEU NOME NO CARTÃO'}</span></div><div><small>VALIDADE</small><span>{expiry||'MM/AA'}</span></div></div></div>
      <div className="card-preview-caption"><ShieldCheck size={20}/><p>Confira o titular e a validade antes de continuar.</p><small>O processamento será disponibilizado em breve.</small></div>
    </div>
    <div className="card-fields">
      <label className="card-number-field">Número do cartão<div className="card-input-wrap"><input type="text" autoComplete="off" inputMode="numeric" maxLength={23} aria-label="Número do cartão, demonstração" placeholder="0000 0000 0000 0000" value={number} onChange={e=>{setNumber(maskCardNumber(e.target.value));setCvv('');}}/><CreditCard size={19}/></div></label>
      <label className="card-holder-field">Nome do titular<input type="text" maxLength={120} autoComplete="off" aria-label="Nome do titular, demonstração" placeholder="Como está no cartão" value={holder} onChange={e=>setHolder(e.target.value)}/></label>
      <label>Validade<input type="text" inputMode="numeric" autoComplete="off" maxLength={5} aria-label="Validade do cartão, demonstração" placeholder="MM/AA" value={expiry} onChange={e=>setExpiry(maskExpiry(e.target.value))}/></label>
      <label>Código de segurança (CVV)<input type="password" inputMode="numeric" autoComplete="off" maxLength={isAmex(number)?4:3} aria-label="Código de segurança, demonstração" placeholder={isAmex(number)?'4 dígitos':'3 dígitos'} value={cvv} onChange={e=>setCvv(digits(e.target.value).slice(0,isAmex(number)?4:3))}/><small className="card-field-hint">{isAmex(number)?'Na frente do cartão.':'No verso do cartão.'}</small></label>
      {children}
    </div>
    <p className="payment-local-note"><LockKeyhole size={15}/>Os campos são opcionais nesta prévia e não são enviados com o pedido.</p>
  </div>;
}
export function PixPaymentFields({total}:{total?:string}){return <div className="payment-details pix-details">
  <div className="payment-detail-heading"><QrCode size={22}/><div><h3>Pagamento com Pix</h3><p>Use o aplicativo do seu banco para pagar.</p></div><span className="payment-preview-badge">Prévia</span></div>
  <div className="pix-preview-total"><div><span>Valor do pedido</span><strong>{total||'Aguardando atualização'}</strong></div><span className="pix-preview-status"><Clock3 size={15}/>Não gerado</span></div>
  <div className="pix-payment-layout"><div className="pix-qr-placeholder" aria-label="Espaço reservado para o futuro QR Code Pix, nenhuma cobrança gerada"><QrCode size={64}/><span>Seu QR Code ficará aqui</span><small>Disponível em breve</small></div><div className="pix-payment-instructions"><h4><Smartphone size={18}/>Como pagar com Pix</h4><ol><li>Abra o aplicativo do seu banco e escolha Pix.</li><li>Escaneie o QR Code ou use o código copia e cola.</li><li>Confira o destinatário e o valor antes de confirmar.</li></ol></div></div>
  <label className="pix-code-field">Pix copia e cola<input readOnly disabled aria-label="Código Pix ainda indisponível" placeholder="O código aparecerá aqui após a geração."/><button type="button" disabled><Copy size={17}/>Copiar código Pix</button></label>
  <p className="payment-interface-note"><Info size={17}/><span>Interface em demonstração. O QR Code e o código Pix ainda não foram gerados. Nenhum pagamento é solicitado nesta etapa.</span></p>
</div>;}
