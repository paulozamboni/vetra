import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import ts from 'typescript';
mkdirSync('.sites-runtime',{recursive:true});
for(const name of ['quote-contract','server-env','currency','vetra-api']) {
  let source=readFileSync('lib/'+name+'.ts','utf8').replaceAll("'./quote-contract'","'./quote-contract.check.mjs'").replaceAll("'./server-env'","'./server-env.check.mjs'").replaceAll("'./currency'","'./currency.check.mjs'");
  writeFileSync('.sites-runtime/'+name+'.check.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {quoteInputSchema}=await import('../.sites-runtime/quote-contract.check.mjs');
const {createQuote,normalizeQuote,normalizeExchange,normalizePlanDetails,getPlanDetails,VetraError}=await import('../.sites-runtime/vetra-api.check.mjs');
const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
const input={destinationId:30,departure:tomorrow,returnDate:tomorrow,ages:[0,35],tripTypeId:1};
assert(quoteInputSchema.safeParse(input).success);
for(const invalid of [{...input,cliente:2},{...input,empresa:444},{...input,ages:[-1]},{...input,ages:[3.5]},{...input,ages:Array(11).fill(30)},{...input,departure:'2026-02-30'},{...input,returnDate:'2020-01-01'}]) assert(!quoteInputSchema.safeParse(invalid).success);
process.env.VETRA_API_LOGIN='test-account';process.env.VETRA_API_PASSWORD='test-secret';
const raw={data:{id:99,vigencia:1,vigencia_inicio:tomorrow,vigencia_fim:tomorrow,empresa:{id:1418},passageiros:[{},{}],planos:[{id:101,tarifa:123.45,error:null,parcela_maxima:1,plano:{id:240,nome:'VETRA TEST',observacao_geral:null,coberturas_na_cotacao:[{id:1,valor:40000,coberto:true,exibe_na_cotacao:true,moeda:{prefixo:'$',nome:'Dólar'},cobertura_item:{id:95,descritivo:'Despesas médicas',resumo:'Descrição'}},{id:2,valor:100,coberto:true,exibe_na_cotacao:false,cobertura_item:{id:96,descritivo:'Oculta'}}]}},{id:102,tarifa:10,error:'Missing agreement',plano:{id:241,nome:'UNAVAILABLE',coberturas_na_cotacao:[]}}]}};
const fullPlan={data:{id:240,nome:'VETRA TEST',publicado:true,servico:{id:1},idade_maxima:65,vigencia_minima:3,vigencia_maxima:91,descricao_politica_agravo:'Consultar política',observacao_geral:'Observação do plano',tarifas:[{valor:999}],coberturas:Array.from({length:30},(_,i)=>({id:i+1,valor:i===29?null:'20000',coberto:i!==29,exibe_na_cotacao:false,moeda:{prefixo:'$',nome:'Dólar'},cobertura_item:{id:i+1,descritivo:'Cobertura '+i,resumo:'Descrição completa'}}))}};
let loginCalls=0,quoteCalls=0,detailCalls=0,first401=true;
globalThis.fetch=async(url,options)=>{
  assert.equal(options.redirect,'manual');
  if(url.endsWith('/user/login')){loginCalls++;return Response.json({data:{token:'opaque-token'}});}
  assert.equal(options.headers.Authorization,'Bearer opaque-token');
  if(url.includes('/cambio/detail-by-date/'))return Response.json({data:{id:2981,data:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),cambio_ita:5.22}});
  if(url.includes('destino-categoria')){assert(url.includes('cliente=4'));return Response.json({data:[{id:30,nome:'Europa'}]});}
  if(url.includes('viagem-tipo')){assert(url.includes('cliente=4'));return Response.json({data:[{id:1,nome:'Lazer / Turismo'}]});}
  if(url.includes('/cotacao?')){
    const body=JSON.parse(options.body);assert.equal(body.cliente,4);assert.equal(body.empresa,1418);assert.equal(body.servico,1);assert.deepEqual(body.passageiros,[{idade:0},{idade:35}]);assert.deepEqual(body.destino_categorias,{add:[30]});
    quoteCalls++;if(first401){first401=false;return new Response(null,{status:401});}return Response.json(raw);
  }
  if(url.includes('/plano/240?')){assert(url.endsWith('cliente=4'));assert.equal(options.method,'GET');detailCalls++;return Response.json(fullPlan);}
  assert.fail('Unexpected endpoint: '+url);
};
const result=await createQuote(input);
assert.equal(loginCalls,2);assert.equal(quoteCalls,2);assert.equal(result.plans[0].price,644.41);assert.equal(result.plans[0].coverages.length,1);assert.equal(result.plans[0].coverages[0].currency,'US$');assert.equal(result.plans[1].price,null);assert.equal(result.plans[1].available,false);
assert.equal(result.currency,'BRL');assert.equal(result.plans[0].priceUsd,123.45);assert.equal(result.exchange.rate,'5.22');assert.equal(result.exchange.field,'cambio_ita');
assert.throws(()=>normalizeExchange({data:{id:1,data:'2030-01-01',cambio_ita:5.22}},'2026-10-02'),VetraError);
assert.throws(()=>normalizeExchange({data:{id:1,data:'2026-10-02',cambio_ita:0}},'2026-10-02'),VetraError);
await assert.rejects(createQuote({...input,destinationId:999}),error=>error instanceof VetraError&&error.status===400);
assert.throws(()=>normalizeQuote({data:{...raw.data,empresa:{id:444}}}),VetraError);
assert(!JSON.stringify(result).includes('opaque-token'));assert(!JSON.stringify(result).includes('Missing agreement'));
console.log('Vetra: tenant isolation, input validation, real IDs, token renewal, unavailable prices and coverage mapping passed.');
const details=await getPlanDetails(240);
assert.equal(details.coverages.length,30);assert.equal(details.coverages[29].included,false);assert.equal(details.coverages[29].value,null);assert.equal(details.coverages[0].value,20000);assert.equal(details.coverages[0].currency,'US$');assert.equal(details.conditions.length,4);assert.equal(details.notes,'Observação do plano');assert(!('tarifas' in details));
await getPlanDetails(240);assert.equal(detailCalls,1);
for(const invalid of [{...fullPlan.data,id:241},{...fullPlan.data,publicado:false},{...fullPlan.data,servico:{id:2}}])assert.throws(()=>normalizePlanDetails({data:invalid},240),error=>error instanceof VetraError&&error.status===404);
await assert.rejects(getPlanDetails(-1),error=>error.status===404);
console.log('Plan details: all 30 coverages, excluded items, currencies, conditions, cache and published travel-plan isolation passed.');
