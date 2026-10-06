import { TravelQuoteForm } from "@/components/travel-quote-form";
import { BrandLogo } from '../../../components/brand-logo';
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ShieldCheck, MapPin } from "lucide-react";
import { allDestinations as destinations } from "@/lib/destinations";
import { DestinationGrid } from "@/components/destination-grid";
import { GoogleReviews } from "@/components/google-reviews";
type Props = { params: Promise<{ destino: string }> };
export function generateStaticParams() { return destinations.map(item => ({ destino: item.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { destino } = await params;
  const destination = destinations.find(item => item.slug === destino);
  return { title: destination ? `Seguro viagem ${destination.name} | Vetra` : "Destino não encontrado | Vetra", description: destination?.description };
}
export default async function DestinationPage({ params }: Props) {
  const { destino } = await params;
  const destination = destinations.find(item => item.slug === destino);
  if (!destination) notFound();
  const quoteUrl = "#cotador";
  return <><a className="skip" href="#destination-content">Ir para o conteúdo</a><header className="site-header"><div className="header-inner"><a className="brand" href="/" aria-label="Vetra, início"><BrandLogo /></a><nav aria-label="Navegação principal" className="destination-nav"><a href="/#destinos">Todos os destinos</a><a className="partner destination-cta" href={quoteUrl}>Cotar seguro</a></nav></div></header><main id="destination-content"><section className="destination-hero"><div className="destination-quote"><TravelQuoteForm initialDestination={destination.region}/></div><div className="destination-hero-inner"><div><div className="breadcrumb"><a href="/">Início</a><span>/</span><a href="/#destinos">Destinos</a><span>/</span><span>{destination.name}</span></div><span className="eyebrow"><MapPin size={15} />{destination.tag.toUpperCase()}</span><h1>Seguro viagem<br /><em>{destination.name}</em></h1><p>{destination.description}</p><a className="destination-primary" href={quoteUrl}>Cotar seguro para {destination.name}</a><span className="destination-demo">Consulte os planos disponíveis para a região da sua viagem</span></div><img src={destination.image} alt={destination.imageAlt} /></div></section><section className="destination-content"><div><span className="eyebrow">PLANEJE SUA PROTEÇÃO</span><h2>{destination.subtitle}</h2><p>{destination.itinerary}</p><p>A escolha do plano depende do roteiro, da duração e de quem vai viajar. Confira as coberturas e condições antes da contratação.</p></div><div className="destination-checklist"><h2>Antes de escolher seu plano</h2><ul>{destination.highlights.map(text => <li key={text}><Check size={18} /><span>{text}</span></li>)}</ul><a href={quoteUrl}>Começar minha cotação</a></div></section><GoogleReviews /><DestinationGrid /></main><footer><div className="footer-inner"><a className="brand" href="/"><BrandLogo /></a><p>Seguro viagem</p><a href={quoteUrl}>Cotar minha viagem</a><span>© {new Date().getFullYear()} Vetra</span></div></footer></>;
}

