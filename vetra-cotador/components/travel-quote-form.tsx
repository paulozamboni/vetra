"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck, LockKeyhole, MapPin, CalendarDays, Users, ChevronDown, Plus, X, Info } from "lucide-react";
import { TravelDateRange } from "@/components/travel-date-range";
import { Button } from "@/components/ui/button";
import { catalogSchema, quoteInputSchema, type Catalog, type QuoteInput } from "@/lib/quote-contract";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateLabel = (date: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" }).format(new Date(date + "T12:00:00Z"));
const tripDays = (start: string, end: string) => Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) + 1;
type Picker = "dates" | "travelers" | null;

export type QuoteFormState={summary:string;input:QuoteInput|null;edited:boolean};
export function TravelQuoteForm({resultsMode=false,initialDestination="",onQuoteChange,onPanelChange}:{resultsMode?:boolean;initialDestination?:string;onQuoteChange?:(state:QuoteFormState)=>void;onPanelChange?:(open:boolean)=>void}) {
  const [destination, setDestination] = useState(initialDestination);
  const [departure, setDeparture] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [ages, setAges] = useState([""]);
  const [panel, setPanel] = useState<Picker>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [tripType, setTripType] = useState("");
  const [quoteInput, setQuoteInput] = useState<QuoteInput | null>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const datesButton = useRef<HTMLButtonElement>(null);
  const travelersButton = useRef<HTMLButtonElement>(null);
  const agesReady = ages.every(age => age !== "" && Number.isInteger(Number(age)) && Number(age) >= 0 && Number(age) <= 120);
  const datesReady = departure !== "" && returnDate !== "" && departure >= today() && returnDate >= departure && tripDays(departure,returnDate) <= 366;

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    fetch('/api/catalog',{signal:controller.signal}).then(async response=>{if(!response.ok) throw new Error();return catalogSchema.parse(await response.json());}).then(data=>{
      setCatalog(data);
      const leisure=data.tripTypes.find(type=>/lazer|turismo/i.test(type.nome));
      const query=new URLSearchParams(window.location.search);
      const requestedType=data.tripTypes.find(type=>String(type.id)===query.get('tipo'));
      const chosen=requestedType??leisure;
      setTripType(chosen?String(chosen.id):'');
      const name=initialDestination||query.get('destino')||'';
      const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const destination=data.destinations.find(d=>normalize(d.nome)===normalize(name))??(name==='América do Sul'?data.destinations.find(d=>/latina/i.test(d.nome)):undefined);
      if(destination) setDestination(destination.nome);
      else if(name){setDestination('');setSummary('');setError('Esse destino ainda não está disponível na consulta. Escolha uma das regiões ativas.');}
      if(resultsMode && destination && chosen){
        const input=quoteInputSchema.safeParse({destinationId:destination.id,departure:query.get('ida'),returnDate:query.get('volta'),ages:(query.get('idades')??'').split(',').filter(Boolean).map(Number),tripTypeId:chosen.id});
        if(input.success) setQuoteInput(input.data);
      }
    }).catch(()=>{if(!controller.signal.aborted)setCatalogError('Não foi possível carregar os destinos. Tente novamente.');});
    return()=>controller.abort();
  },[catalogAttempt,resultsMode,initialDestination]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const selected = initialDestination || query.get("destino");
    if (selected) setDestination(selected);
    const start = query.get("ida") ?? "";
    const end = query.get("volta") ?? "";
    const passengers = (query.get("idades") ?? "").split(",");
    const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z")) && new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date;
    if (selected && validDate(start) && validDate(end) && start >= today() && end >= start && passengers.length <= 10 && passengers.every(age => /^\d{1,3}$/.test(age) && Number(age) <= 120)) {
      setDeparture(start); setReturnDate(end); setAges(passengers);
      const days = tripDays(start, end);
      setSummary(`${selected} · ${dateLabel(start)} ${start.slice(0, 4)} a ${dateLabel(end)} ${end.slice(0, 4)} · ${days} ${days === 1 ? "dia" : "dias"} · ${passengers.length} ${passengers.length === 1 ? "viajante" : "viajantes"}`);
    }
  }, [initialDestination]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!quoteRef.current?.contains(event.target as Node)) setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanel(null);
        if (panel === "dates") datesButton.current?.focus();
        if (panel === "travelers") travelersButton.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    if (panel) quoteRef.current?.querySelector<HTMLInputElement>(`#${panel}-panel input`)?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  useEffect(() => {
    onQuoteChange?.({summary,input:quoteInput,edited:Boolean(!summary && (destination || departure || returnDate || ages.some(age => age !== "")))});
  },[summary,quoteInput,destination,departure,returnDate,ages,onQuoteChange]);
  useEffect(()=>{onPanelChange?.(panel!==null);},[panel,onPanelChange]);

  function changed() { setSummary(""); setQuoteInput(null); setError(""); }
  function closePicker() {
    const previous = panel;
    setPanel(null);
    (previous === "dates" ? datesButton : travelersButton).current?.focus();
  }
  function confirmDates() {
    if (!datesReady) { setError("Selecione o embarque no Brasil a partir de hoje e o desembarque no retorno ao Brasil. O período máximo é de 366 dias."); return; }
    setError(""); closePicker();
  }
  function confirmTravelers() {
    if (!agesReady) { setError("Informe a idade de todos os viajantes: um número inteiro entre 0 e 120 anos."); return; }
    setError(""); closePicker();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); changed();
    if (!destination) {
      setError("Selecione o destino da sua viagem.");
      quoteRef.current?.querySelector<HTMLElement>("select")?.focus(); return;
    }
    if (!datesReady) { setError("Confira o embarque e o desembarque no Brasil. Selecione um período a partir de hoje, com até 366 dias."); setPanel("dates"); return; }
    if (!agesReady) { setError("Informe a idade de todos os viajantes: um número inteiro entre 0 e 120 anos."); setPanel("travelers"); return; }
    const destinationItem=catalog?.destinations.find(item=>item.nome===destination);
    const input=quoteInputSchema.safeParse({destinationId:destinationItem?.id,departure,returnDate,ages:ages.map(Number),tripTypeId:Number(tripType)});
    if(!input.success){setError('Confira o destino e o período (até 366 dias).');return;}
    setPanel(null);
    const days = tripDays(departure, returnDate);
    setSummary(`${destination} · ${dateLabel(departure)} a ${dateLabel(returnDate)} · ${days} ${days === 1 ? "dia" : "dias"} · ${ages.length} ${ages.length === 1 ? "viajante" : "viajantes"} · Idades: ${ages.join(", ")} anos`);
    if (!resultsMode) {
      const query = new URLSearchParams({ destino: destination, ida: departure, volta: returnDate, idades: ages.join(","), tipo:tripType });
      window.location.assign(`/resultados?${query.toString()}`);
    } else setQuoteInput(input.data);
  }

  return <div className="quote-shell" id="cotador" ref={quoteRef}>
            <h2 className="quote-tab"><ShieldCheck size={18} />Cote seu seguro viagem</h2>
            <form className="quote-card" onSubmit={submit} noValidate>
              <div className="quote-fields">
                <label className="destination field-block"><span className="field-caption">DESTINO</span><span className="control-row"><MapPin /><select value={destination} required disabled={!catalog} aria-describedby={error ? "quote-error" : undefined} onFocus={() => setPanel(null)} onChange={event => { setDestination(event.target.value); changed(); }}><option value="" disabled>{catalog?'Para onde você vai?':'Carregando destinos…'}</option>{catalog?.destinations.map(region => <option key={region.id} value={region.nome}>{region.nome}</option>)}</select></span></label>
                <div className="picker field-block">
                  <button type="button" ref={datesButton} className="picker-trigger" aria-expanded={panel === "dates"} aria-controls="dates-panel" aria-describedby={error ? "quote-error" : undefined} onClick={() => setPanel(panel === "dates" ? null : "dates")}><span className="field-caption">DATAS DA VIAGEM</span><span className="control-row"><CalendarDays /><span>{datesReady ? `${dateLabel(departure)} — ${dateLabel(returnDate)}` : "Quando você viaja?"}</span><ChevronDown size={17} /></span></button>
                  {panel === "dates" && <TravelDateRange departure={departure} returnDate={returnDate} today={today()} onChange={(start,end)=>{setDeparture(start);setReturnDate(end);changed();}} onConfirm={confirmDates} onClose={closePicker}/>}
                </div>
                <div className="picker field-block">
                  <button type="button" ref={travelersButton} className="picker-trigger" aria-expanded={panel === "travelers"} aria-controls="travelers-panel" aria-describedby={error ? "quote-error" : undefined} onClick={() => setPanel(panel === "travelers" ? null : "travelers")}><span className="field-caption">VIAJANTES</span><span className="control-row"><Users /><span>{agesReady ? `${ages.length} ${ages.length === 1 ? "viajante" : "viajantes"}` : "Quem vai viajar?"}</span><ChevronDown size={17} /></span></button>
                  {panel === "travelers" && <div className="popover travelers-popover" id="travelers-panel"><div className="popover-heading"><h3>Quem vai viajar?</h3><button type="button" onClick={closePicker} aria-label="Fechar viajantes"><X size={18} /></button></div><p>Informe a idade na data de ida. Para bebês com menos de um ano, use 0.</p><div className="travelers-list">{ages.map((age, index) => <div className="traveler" key={index}><label htmlFor={`age-${index}`}>Viajante {index + 1}</label><div><input id={`age-${index}`} type="number" inputMode="numeric" min="0" max="120" step="1" placeholder="Idade" value={age} onChange={event => { setAges(ages.map((value, i) => i === index ? event.target.value : value)); changed(); }} /><span>anos</span>{index > 0 && <button type="button" aria-label={`Remover viajante ${index + 1}`} onClick={() => { setAges(ages.filter((_, i) => i !== index)); changed(); }}><X size={16} /></button>}</div></div>)}</div><button type="button" className="add-traveler" disabled={ages.length >= 10} onClick={() => { setAges([...ages, ""]); changed(); }}><Plus size={16} />Adicionar viajante</button><Button type="button" className="confirm" onClick={confirmTravelers}>Confirmar viajantes</Button></div>}
                </div>
                <Button type="submit" className="submit" disabled={!catalog}>{resultsMode ? "Atualizar cotação" : "Cotar meu seguro"}</Button>
              </div>
              <div className="quote-meta"><span>Origem: <strong>Brasil</strong></span><span><LockKeyhole size={13} />Sem compromisso</span></div>
              {catalogError&&<p className="error" role="alert">{catalogError}<button type="button" onClick={()=>setCatalogAttempt(value=>value+1)}>Tentar novamente</button></p>}
              {error && <p className="error" id="quote-error" role="alert"><Info size={16} />{error}</p>}
            </form>
            <p className="demo"><Info size={13} />Compare preços e coberturas para o período completo da viagem.</p>
          </div>;
}
