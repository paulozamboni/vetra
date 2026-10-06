"use client";
import { useEffect, useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import { z } from "zod";
import { businessProfileUrl } from "@/lib/site-config";
type Review = { id: string; author: string; rating: number; text: string; date: string };
type Feed = { status: "ready" | "not_configured" | "unavailable"; average?: number; count?: number; reviews?: Review[]; profileUrl?: string };
const feedSchema = z.object({ status: z.enum(["ready", "not_configured", "unavailable"]), average: z.number().min(0).max(5).optional(), count: z.number().nonnegative().optional(), profileUrl: z.string().optional(), reviews: z.array(z.object({ id: z.string(), author: z.string(), rating: z.number().min(1).max(5), text: z.string(), date: z.string().datetime() })).optional() });
export function GoogleReviews() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reviews", { signal: controller.signal }).then(response => response.json()).then(data => setFeed(feedSchema.parse(data))).catch(error => { if (error.name !== "AbortError") setFeed({ status: "unavailable" }); });
    return () => controller.abort();
  }, [retry]);
  return <section className="reviews-section" id="avaliacoes" aria-labelledby="reviews-title"><div className="reviews-heading"><div><span className="eyebrow">HISTÓRIAS DE QUEM VIAJA</span><h2 id="reviews-title">A experiência de nossos viajantes.</h2><p>Avaliações publicadas no Google.</p></div><div className="google-profile-link"><span className="google-source">Google</span><a href={businessProfileUrl} target="_blank" rel="noopener noreferrer">Ver avaliações no Google</a></div></div>
    {!feed ? <p className="reviews-empty" role="status">Carregando avaliações…</p> : feed.status === "ready" ? <><div className="review-score"><strong>{feed.average?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong><span aria-label={`Nota ${feed.average} de 5`}>/ 5</span><span>{feed.count} avaliações no Google</span>{feed.profileUrl && <a href={feed.profileUrl} target="_blank" rel="noopener noreferrer">Ver avaliações no Google</a>}</div><div className="reviews-grid">{feed.reviews?.map(review => <article className="review-card" key={review.id}><div className="review-author"><span className="review-avatar" aria-hidden="true">{review.author.charAt(0)}</span><div><h3>{review.author}</h3><time dateTime={review.date}>{new Date(review.date).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</time></div></div><div className="review-stars" aria-label={`${review.rating} de 5 estrelas`}>{Array.from({ length: 5 }, (_, i) => <Star size={15} key={i} fill={i < review.rating ? "currentColor" : "none"} aria-hidden="true" />)}</div>{review.text ? <p>{review.text}</p> : <p>Avaliação sem comentário.</p>}<span className="review-source">Publicado no Google</span></article>)}</div>{!feed.reviews?.length && <p className="reviews-empty">Nenhuma avaliação publicada disponível no momento.</p>}</> : <div className="reviews-empty"><MessageSquare size={25} /><div><h3>{feed.status === "not_configured" ? "As histórias dos nossos viajantes chegam em breve." : "As avaliações não estão disponíveis agora."}</h3><p>{feed.status === "not_configured" ? "Este espaço receberá as avaliações reais do perfil da Vetra no Google." : "Você pode tentar novamente em alguns instantes."}</p>{feed.status === "unavailable" && <button onClick={() => { setFeed(null); setRetry(value => value + 1); }}>Tentar novamente</button>}</div></div>}
  </section>;
}
