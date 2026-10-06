"use client";

import { TravelQuoteForm, type QuoteFormState } from "@/components/travel-quote-form";
import { BrandLogo } from '../components/brand-logo';
import { useCallback, useState } from "react";
import { LockKeyhole, ChevronDown, X, Menu } from "lucide-react";
import { HeroCarousel } from "@/components/hero-carousel";
import { DestinationGrid } from "@/components/destination-grid";
import { GoogleReviews } from "@/components/google-reviews";
import { QuoteResults } from "@/components/quote-results";
import type { QuoteInput } from "@/lib/quote-contract";

const partnerUrl = process.env.NEXT_PUBLIC_PARTNER_URL || "https://www.itasistema.com.br";

export default function Home({ resultsMode = false }: { resultsMode?: boolean } = {}) {
  const [summary,setSummary]=useState("");
  const [quoteInput,setQuoteInput]=useState<QuoteInput|null>(null);
  const [edited,setEdited]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [partnerNotice,setPartnerNotice]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const handleQuoteChange=useCallback((state:QuoteFormState)=>{setSummary(state.summary);setQuoteInput(state.input);setEdited(state.edited);},[]);

  return <>
    <a className="skip" href="#cotador">Ir para o cotador</a>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="Vetra, início"><BrandLogo /></a>
        <span className="product">SEGURO VIAGEM</span>
        <button type="button" className="mobile-menu" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <nav id="main-nav" className={menuOpen ? "open" : ""} aria-label="Navegação principal">
          <a href="#cotador" onClick={() => setMenuOpen(false)}>Cotar seguro</a>
          <a href={resultsMode ? "/#destinos" : "#destinos"} onClick={() => setMenuOpen(false)}>Destinos</a>
          <a href={resultsMode ? "/#avaliacoes" : "#avaliacoes"} onClick={() => setMenuOpen(false)}>Avaliações</a>
          <a href={resultsMode ? "/#duvidas" : "#duvidas"} onClick={() => setMenuOpen(false)}>Dúvidas</a>
          {partnerUrl ? <a className="partner" href={partnerUrl}><LockKeyhole size={15} />Área do parceiro</a> : <button className="partner" type="button" aria-expanded={partnerNotice} onClick={() => { setPartnerNotice(!partnerNotice); setMenuOpen(false); }}><LockKeyhole size={15} />Área do parceiro</button>}
        </nav>
      </div>
    </header>
    {partnerNotice && <aside className="partner-notice" role="status">O link para o sistema de agências e corretores estará disponível aqui em breve.<button onClick={() => setPartnerNotice(false)} aria-label="Fechar aviso"><X size={18} /></button></aside>}
    <main>
      <section className={`hero ${resultsMode ? "compact-hero" : ""}`} aria-labelledby={resultsMode ? undefined : "hero-title"}>
        <HeroCarousel paused={pickerOpen || resultsMode} compact={resultsMode}>
          <TravelQuoteForm resultsMode={resultsMode} onQuoteChange={handleQuoteChange} onPanelChange={setPickerOpen}/>
        </HeroCarousel>
      </section>
      {resultsMode ? <QuoteResults summary={summary} input={quoteInput} edited={edited} /> : <>
      <DestinationGrid />
      <GoogleReviews />
      <section className="how-section" id="como-funciona" aria-labelledby="how-title"><div className="section-heading"><span className="eyebrow">SIMPLES, DO INÍCIO AO DESTINO</span><h2 id="how-title">Sua próxima viagem começa aqui.</h2><p>Três passos para escolher seu seguro viagem.</p></div><ol className="how-grid illustrated-steps">{[
{number:'01',image:'planejar',alt:'Pessoa planejando a viagem com um mapa, computador e mala',title:'Conte sobre sua viagem',text:'Escolha o destino, o período e informe quem vai com você.'},
{number:'02',image:'comparar',alt:'Pessoa comparando opções de proteção para a viagem',title:'Compare as opções',text:'Confira coberturas, limites e condições antes de escolher seu plano.'},
{number:'03',image:'revisar',alt:'Viajante revisando os documentos de proteção ao lado de sua mala',title:'Finalize a contratação',text:'Revise os dados e as condições do seguro antes do pagamento.'}
].map(step=><li key={step.number}><div className="how-step-art"><img src={'/images/steps/'+step.image+'.webp'} alt={step.alt} width={640} height={640} loading="lazy" decoding="async"/></div><div className="how-step-copy"><div className="how-step-title"><span className="step-number">{step.number}</span><h3>{step.title}</h3></div><p>{step.text}</p></div></li>)}</ol><p className="roadmap-note">Consulte planos e coberturas para sua viagem. A contratação e o pagamento serão disponibilizados na próxima etapa.</p></section>
      <section className="coverage-section illustrated-coverage" aria-labelledby="coverage-title"><div><span className="eyebrow">ESCOLHA COM CONFIANÇA</span><h2 id="coverage-title">O que olhar no seu seguro?</h2><p>A proteção certa começa pelas condições do plano.</p></div><article><div className="coverage-art"><img src="/images/coverage/saude.webp" alt="Profissional de saúde acolhendo um viajante" width={640} height={640} loading="lazy" decoding="async"/></div><div className="coverage-copy"><h3>Saúde durante a viagem</h3><p>Compare os limites para despesas médicas e hospitalares e as condições de atendimento.</p></div></article><article><div className="coverage-art"><img src="/images/coverage/bagagem.webp" alt="Viajante conferindo seus documentos ao lado das malas" width={640} height={640} loading="lazy" decoding="async"/></div><div className="coverage-copy"><h3>Bagagem e imprevistos</h3><p>Confira as coberturas incluídas, suas exclusões e os documentos necessários para acioná-las.</p></div></article><article><div className="coverage-art"><img src="/images/steps/comparar.webp" alt="Viajante comparando os benefícios de diferentes planos de seguro" width={640} height={640} loading="lazy" decoding="async"/></div><div className="coverage-copy"><h3>Todas as coberturas e benefícios</h3><p>Cada plano tem benefícios, limites e condições próprios. Na comparação, abra “Ver coberturas e condições” para consultar todos os itens e as exclusões antes de escolher.</p><a className="coverage-guide-link" href="#cotador">Comparar coberturas dos planos</a></div></article></section>
      <section className="faq-section" id="duvidas" aria-labelledby="faq-title"><div><span className="eyebrow">ANTES DE EMBARCAR</span><h2 id="faq-title">Dúvidas para começar?</h2><p>Veja como preencher sua cotação.</p></div><div className="faq-list"><details><summary>Quais datas devo informar?<ChevronDown size={18} /></summary><p>Informe a data de embarque no Brasil e a data de desembarque no retorno ao Brasil. É muito importante incluir todo o período da sua viagem, desde a saída até a chegada de volta, para contratar a proteção pelo período completo.</p></details><details><summary>Posso incluir mais de uma pessoa?<ChevronDown size={18} /></summary><p>Sim. Abra o seletor de viajantes e adicione cada pessoa, informando a idade na data de ida. Esta prévia permite até dez viajantes.</p></details><details><summary>A cotação já apresenta preços?<ChevronDown size={18} /></summary><p>Sim. A consulta apresenta os planos, tarifas e coberturas retornados pela Vetra para o destino, período e idades informados.</p></details><details><summary>Como funciona a nossa assistência?<ChevronDown size={18} /></summary><p>Nossa assistência oferece um atendimento acolhedor, em português. Cuidamos de todas as ocorrências 24 horas por dia, 7 dias por semana.</p></details></div></section>
      </>}
    </main>
    <footer><div className="footer-inner"><a className="brand" href="/"><BrandLogo /></a><p>Seguro viagem</p><a href="#cotador">Voltar ao cotador</a><span>© {new Date().getFullYear()} Vetra</span></div></footer>
  </>;
}

