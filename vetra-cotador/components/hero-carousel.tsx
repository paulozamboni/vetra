"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { campaigns } from "@/lib/campaigns";

export function HeroCarousel({ children, paused, compact = false }: { children: ReactNode; paused: boolean; compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    update(); visibility(); media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (paused || stopped || hovered || focused || reduced || hidden) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % campaigns.length), 8000);
    return () => window.clearInterval(timer);
  }, [paused, stopped, hovered, focused, reduced, hidden, index]);
  const campaign = campaigns[index];
  return <div className="campaign-carousel" aria-roledescription="carrossel" aria-label="Campanhas de viagem Vetra" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {campaigns.map((item, i) => <img key={item.id} className={`hero-image campaign-image ${i === index ? "visible" : ""}`} src={item.image} alt={i === index ? item.alt : ""} aria-hidden={i !== index} style={{ objectPosition: item.position }} />)}
    <div className="hero-shade" />
    <div className="hero-inner">{children}{!compact && <><div className="hero-copy" aria-live="off"><span className="eyebrow">{campaign.eyebrow}</span><h1 id="hero-title">{campaign.title.split("\n").map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</h1><p>{campaign.description.split("\n").map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}</p><span className="campaign-signature">O mundo te espera. A tranquilidade vai com você.</span></div>
      <div className="carousel-controls"><button type="button" aria-label="Banner anterior" onClick={() => setIndex(value => (value - 1 + campaigns.length) % campaigns.length)}><ChevronLeft size={19} /></button><div className="carousel-dots">{campaigns.map((item, i) => <button key={item.id} type="button" aria-label={`Mostrar banner ${i + 1}: ${item.eyebrow.toLowerCase()}`} aria-current={index === i ? "true" : undefined} onClick={() => setIndex(i)} />)}</div><button type="button" aria-label="Próximo banner" onClick={() => setIndex(value => (value + 1) % campaigns.length)}><ChevronRight size={19} /></button><span className="carousel-divider" /><button type="button" aria-label={stopped ? "Retomar troca automática de banners" : "Pausar troca automática de banners"} aria-pressed={stopped} onClick={() => setStopped(!stopped)}>{stopped ? <Play size={16} /> : <Pause size={16} />}</button></div>
    </>}</div>
  </div>;
}
