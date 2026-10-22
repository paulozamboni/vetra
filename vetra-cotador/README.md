# Vetra — cotador B2C

Interface em React e TypeScript, estrutura Next.js App Router executada pelo Vinext do Sites, Tailwind e botão shadcn/ui.

## Execução
`npm install` e `npm run dev`. Produção: `npm run build`.

## Estado atual
Cotador horizontal sobre uma imagem de viagem, inspirado na estrutura da Assist Card e com identidade Vetra. No celular, os campos ficam empilhados e os seletores abrem dentro do formulário. Datas e até dez viajantes têm seletores expansíveis, confirmação, validação e resumo. Escape fecha o seletor e devolve o foco ao botão. O menu inclui atalhos para o cotador, orientações e dúvidas.

Não consulta preços, coleta pagamentos ou emite seguros. Limite de 120 anos é validação de entrada; limites comerciais virão da API. O período inclui ida e volta. A data mínima segue America/Sao_Paulo.

## Integrações
Defina NEXT_PUBLIC_PARTNER_URL com a URL do sistema B2B existente antes do build. Sem endereço, o botão mostra um aviso. O site não solicita credenciais B2B.

Conectar a cotação B2C por uma rota de servidor, mantendo credenciais da API fora do navegador. Planos, valores e condições devem vir do contrato real da API. Não há necessidade de banco próprio ou nova autenticação nesta etapa.

## Campanhas, destinos e resultados

Imagens ilustrativas criadas com ImageGen em `public/images`, com prompts em `IMAGE-ASSETS.md`. As campanhas estão centralizadas em `lib/campaigns.ts`, prontas para receber a imagem autorizada do futuro influenciador. Troca automática a cada oito segundos, pausada ao focar ou passar o mouse no cotador, abrir seletores, ocultar a aba ou preferir movimento reduzido.

Páginas: `/seguro-viagem/europa`, `/portugal`, `/estados-unidos`, `/argentina`, `/chile`, `/brasil` (todas sob `/seguro-viagem`). O CTA preenche a região no cotador. Conteúdo não declara exigências legais de entrada ou coberturas garantidas.

`/resultados` mantém o mesmo cotador com imagem compacta. Modelos de planos demonstrativos podem ser selecionados para comparação. Não apresentam ofertas comerciais reais. Ao enviar o formulário inicial, destino, datas e idades acompanham a navegação para preservar o preenchimento.

## Avaliações Google

Link do perfil informado pelo usuário: https://share.google/alVITkMyfcTc3jcEa, centralizado em `lib/site-config.ts`. A API `/api/reviews` consulta a Google Business Profile API com OAuth e cache de cinco minutos. Exibe seis avaliações recentes, média e quantidade retornadas pelo Google, sem criar depoimentos fictícios.

Configure as variáveis de `.env.example` no servidor: IDs da conta e local verificado, client ID, client secret e refresh token OAuth com acesso à empresa. O link público não substitui a autorização OAuth. Segredos nunca usam prefixo NEXT_PUBLIC. Registre o aplicativo e autorize o escopo business.manage conforme https://developers.google.com/my-business/content/review-data. Nunca cole tokens no chat nem faça commit do `.env`.

Sem configuração, a seção mostra uma mensagem e o link do Google. Falhas externas mostram indisponibilidade com tentativa manual. Para testar a integração sem chamadas externas: `node --experimental-strip-types tests/reviews.mjs`.

Identidade visual conforme `../Manual_Vetra_Seguros_Consistente.html`: paleta oficial, Manrope local (400/600/700/800, licença OFL em `public/fonts`), títulos sem compressão e marca de referência em `public/images/vetra-marca-oficial.png`. O logo foi extraído sem redesenho ou recoloração; apenas o rótulo da prancha foi excluído. Aplicações sobre fundo escuro preservam uma área clara, pois o manual não fornece uma versão negativa oficial.

## Integração Vetra / ITA
A API é consultada somente no servidor. Configure VETRA_API_LOGIN e VETRA_API_PASSWORD como secrets, sem prefixo NEXT_PUBLIC. Em ambiente local use .env.local, ignorado pelo Git. As tabelas usam cliente=4; a criação de cotações usa cliente=4, empresa=1418 e servico=1. Os destinos e tipos de viagem usam IDs retornados pelo catálogo, sem reutilizar IDs da ITA.

GET /api/catalog carrega destinos ativos e tipos de viagem. POST /api/quotes valida datas, idades e IDs, cria a cotação e retorna apenas os campos necessários à interface. O token é armazenado em memória, renovado em 401 e nunca enviado ao navegador. Falhas de configuração ou transporte não expõem dados da conta. A interface inclui comparação de até três planos e ordenação de tarifas. Planos com erro de tarifa ficam indisponíveis.

A tarifa da API é em USD e convertida para BRL com cambio_ita da data atual no Brasil, consultado na própria API. Não há margem local ou taxa fixa. A variável VETRA_QUOTE_CURRENCY não controla mais essa conversão. Coberturas mantêm a moeda retornada pela API. Pagamento e emissão não foram habilitados nesta etapa; nenhuma chamada a /processo é feita.

Validação: node tests/vetra-api.mjs; node --experimental-strip-types tests/reviews.mjs; tsc --noEmit. scripts/inspect-vetra-api.mjs consulta a API real com secrets locais; --quote cria uma cotação de teste, sem emissão. Documentação: https://documenter.getpostman.com/view/10096133/SztD6npK?version=latest



## Envio de pedidos ao dashboard

O checkout agora coleta contato, nome/CPF/idade dos passageiros e preferência de pagamento, sem solicitar dados de cartão. `POST /api/orders` revalida a cotação na Vetra no servidor e envia ao Django com um token exclusivo para criação. Configure `VETRA_OPERATIONS_URL` (origem HTTPS do backend em produção) e `VETRA_OPERATIONS_TOKEN`; nunca usar prefixo NEXT_PUBLIC. O backend deve usar o mesmo valor em CHECKOUT_INGEST_TOKEN.

Pedido recebido vira “Aguardando pagamento”, com número Vetra local, sem cobrança ou emissão. Reenvios com o mesmo identificador não duplicam pedidos. Valores divergentes pedem atualização da cotação. Tarifa sem moeda confirmada é registrada como XXX, explicitamente provisória. IDs da cotação e plano são guardados para futura integração de processamento. Dados de cartão nunca fazem parte deste request.

A integração atual está validada localmente entre as portas 5173 e 8080. O site publicado ainda não pode acessar o Django local; requer hospedagem do backend, URL HTTPS e secrets de produção antes da ativação. Verificações: `node tests/orders.mjs`, `tsc --noEmit` e os testes Django em ../vetra-operacoes.


### Câmbio da Vetra

Venda em reais: `/cambio/detail-by-date/{hoje_em_America_Sao_Paulo}?cliente=4`, campo **cambio_ita**, com data exata e taxa positiva. O câmbio é consultado antes da cotação, mantido em cache por até cinco minutos e guardado no pedido. Sem taxa válida, não exibir preço em dólares como se fosse reais. Cálculo com BigInt decimal e arredondamento HALF_UP. `price` é BRL; `priceUsd` preserva a tarifa original; `exchange` é o registro usado. Dados do backend/relatórios incluem as duas moedas. Os limites de cobertura seguem suas moedas originais.

Testes adicionais: `node tests/currency.mjs`, `node tests/vetra-api.mjs`, `node tests/orders.mjs`.
# Deploy em VPS com Docker

O ambiente completo está em `../compose.yaml`, com instruções em `../deploy/vps/README.md`. O Dockerfile compila este cotador para Node standalone com `VETRA_DEPLOY_TARGET=node`; o build padrão mantém o destino Sites/Workers. Credenciais são fornecidas somente em runtime, fora da imagem.



## Prévia visual de pagamento

O checkout exibe interfaces de cartão e Pix, sem integração de pagamento. Cartão: máscara do número/validade/CVV, prévia visual com apenas os quatro últimos dígitos e campos opcionais sem name, armazenamento ou envio. Dados reais não devem ser usados na demonstração. Pix: valor, instruções, espaço reservado não pagável e cópia desabilitada, sem código BR Code fictício. Alternar o método desmonta o formulário e descarta o estado de cartão. O pedido continua enviando apenas paymentMethod, sem dados financeiros. Parcelamento indisponível até receber condições reais. Na integração, substituir os inputs de cartão por campos/tokenização do gateway e gerar o Pix no servidor com o valor revalidado; adicionar confirmação, expiração, falha e conciliação por webhook conforme a documentação escolhida.


## Confirmação e contato do pagador

Após sucesso de POST /api/orders, o checkout abre uma tela completa “Pedido recebido!” e apresenta a referência VT gerada pelo backend, total confirmado, plano e contatos. A tela só aparece com recibo validado; falhas mantêm o formulário. A mensagem orienta o recebimento da apólice no e-mail do responsável após confirmação de pagamento e processamento. O envio de e-mail e emissão continuam dependentes das futuras integrações.

O e-mail do pagador é obrigatório no B2C para Pix e cartão. Possui campo próprio, sempre editável e preenchido diretamente pelo cliente. É validado no servidor, enviado como payer_email ao dashboard e exibido nos detalhes, busca e CSV; não se mistura a dados de cartão. Pedidos antigos preservam o campo vazio. A migração 0007 adiciona a coluna.


## Telefone de contato e preenchimento do pagador

O checkout exige telefone com 10 a 15 dígitos (DDD e código do país opcional). A API normaliza formatação, preserva + quando informado e grava customer_phone no pedido. O dashboard mostra esse contato nos detalhes e no CSV; pedidos anteriores permanecem com telefone vazio. O e-mail do pagador acompanha o e-mail do responsável enquanto não for editado; após uma edição manual, alterações no responsável não sobrescrevem o endereço do pagador. O campo continua sempre editável, sem checkbox ou bloqueio.


## Cupons no pagamento

O resumo do checkout contém Aplicar/remover cupom. A rota POST /api/coupons valida origem e recota o plano no servidor antes de obter o desconto do backend. Ao mudar idades, plano ou valor, o cupom aplicado é removido e precisa ser revalidado. A gravação envia o código e o total com desconto para conferência final no Django. O total confirmado aparece no recibo; o dashboard mostra o subtotal, cupom e desconto separadamente. Códigos inválidos/inativos não alteram o valor, e falhas de validação não são tratadas como desconto zero silencioso. Gestão em Cupons é exclusiva para superusuários.
