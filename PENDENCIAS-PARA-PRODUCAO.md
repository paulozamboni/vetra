# Vetra — pendências para operação completa

Atualizado em 22/10/2026.

## Objetivo

Concluir o fluxo: cotação → pedido recebido → pagamento confirmado → emissão pela API → obtenção da apólice → envio de e-mail ao cliente.

## O que já funciona no ambiente local

- Cotação e comparação de planos, com preços no Pix e no cartão.
- Cadastro de pedidos com responsável, telefone, e-mail do pagador e passageiros.
- Cupons, desconto Pix e parcelamento configuráveis na dash.
- Gerenciamento interno de pedidos e histórico de alterações.
- Captura e agrupamento de leads, pesquisas por cookie, histórico, exclusão e exportação CSV.

As interfaces de cartão e Pix ainda são demonstrativas. O processamento interno de um pedido não confirma pagamento nem emite apólice. O envio automático de e-mails ainda não está integrado.

## 1. Credenciais e loja da API — obrigatório antes da produção

> Atualmente, o desenvolvimento utiliza credenciais da Seguros Promo. A operação definitiva deve usar as credenciais da loja Site Vetra.

- [ ] Obter a key e as demais credenciais da loja Site Vetra.
- [ ] Conferir na documentação a forma de autenticação e substituir as credenciais de desenvolvimento.
- [ ] Confirmar os identificadores de loja, cliente, empresa e serviço vinculados à nova conta. Não reutilizar os valores atuais sem validação.
- [ ] Configurar os segredos somente no servidor, fora do código, do Git e do navegador.
- [ ] Validar catálogo, preços, câmbio, coberturas e condições comerciais com a nova conta.
- [ ] Validar emissão e obtenção da apólice com a loja Site Vetra.
- [ ] Confirmar que os pedidos e as apólices são registrados na loja correta.
- [ ] Separar as configurações de homologação e produção e retirar as credenciais da Seguros Promo do ambiente definitivo.

## 2. Gateway de pagamento

- [ ] Escolher o gateway e obter documentação, conta e credenciais de homologação.
- [ ] Confirmar as formas de pagamento, bandeiras, limites, parcelas e taxas disponíveis.
- [ ] Integrar cartão com campos seguros/tokenização do gateway, sem armazenar número completo ou CVV.
- [ ] Integrar a criação da cobrança Pix, com QR Code real, código copia e cola e validade.
- [ ] Revalidar no servidor o valor da compra, cupom, desconto Pix, juros e parcelamento antes de criar a cobrança.
- [ ] Conferir se as regras de parcelamento configuradas na dash são compatíveis com o gateway.
- [ ] Vincular cada cobrança ao pedido e registrar os identificadores da transação e das tentativas.
- [ ] Evitar cobranças duplicadas ao clicar novamente, atualizar a página ou repetir uma requisição.
- [ ] Tratar cartão recusado, autenticação adicional quando exigida, Pix expirado, pagamento cancelado e falha de comunicação.
- [ ] Disponibilizar uma nova tentativa de pagamento sem duplicar o pedido.

## 3. Confirmação de pagamento e conciliação

- [ ] Criar o endpoint de webhook do gateway, acessível por HTTPS.
- [ ] Validar a assinatura/autenticidade das notificações conforme a documentação escolhida.
- [ ] Conferir identificador, valor, moeda e vínculo da transação com o pedido.
- [ ] Definir se a confirmação comercial depende de autorização ou captura; emitir somente após a captura/confirmação exigida pelo gateway.
- [ ] Atualizar o pedido para Pagamento confirmado apenas com confirmação confiável do servidor.
- [ ] Processar notificações repetidas ou fora de ordem sem duplicar cobrança, emissão ou e-mail.
- [ ] Consultar o gateway quando o resultado da cobrança for incerto.
- [ ] Criar rotina de conciliação para pagamentos sem webhook recebido ou sem atualização concluída.
- [ ] Registrar cancelamentos, estornos e contestações conforme os eventos fornecidos pelo gateway.

## 4. Emissão e obtenção da apólice pela API

- [ ] Obter e conferir a documentação dos endpoints de emissão, consulta e obtenção do documento da apólice.
- [ ] Confirmar todos os dados obrigatórios de responsável e passageiros e completar o checkout, se necessário.
- [ ] Definir como tratar mudança de preço ou indisponibilidade do plano entre cotação, pagamento e emissão.
- [ ] Iniciar a emissão após o pagamento capturado/confirmado, vinculando pedido, transação, cotação e plano.
- [ ] Executar a emissão em tarefa de processamento com controle de tentativas.
- [ ] Guardar protocolos, identificadores e números de apólice por passageiro.
- [ ] Consultar a API até obter a situação final quando o processamento for assíncrono.
- [ ] Obter o PDF ou link da apólice pela API.
- [ ] Tratar emissão parcial: alguns passageiros emitidos e outros com falha.
- [ ] Antes de repetir uma chamada de resultado incerto, consultar se a apólice já foi emitida.
- [ ] Permitir reprocessamento autorizado, com histórico e sem emissão duplicada.
- [ ] Disponibilizar os documentos por acesso autorizado e definir armazenamento, validade dos links e retenção.

## 5. E-mails transacionais

### Configuração

- [ ] Escolher o serviço de envio e configurar domínio e remetente.
- [ ] Configurar e validar SPF, DKIM e DMARC.
- [ ] Guardar as credenciais do serviço somente no servidor.
- [ ] Criar os modelos de e-mail com a identidade visual Vetra e versões em texto simples.
- [ ] Definir o responsável pelo pedido como destinatário da apólice e definir quando o pagador também recebe avisos financeiros.

### Pedido recebido

- [ ] Enviar após o pedido ter sido salvo com sucesso.
- [ ] Informar número do pedido, plano, viagem, passageiros, valor e forma de pagamento.
- [ ] Informar a situação real: pedido recebido ainda não significa pagamento confirmado ou cobertura emitida.
- [ ] Incluir instrução/link de pagamento e validade da cobrança, quando disponíveis.

### Pagamento confirmado

- [ ] Enviar após confirmação/captura validada pelo servidor.
- [ ] Informar o recebimento e o início do processamento da emissão.
- [ ] Evitar declarar cobertura vigente antes da confirmação de emissão pela API.

### Pedido processado e apólice emitida

- [ ] Enviar após obter e validar os documentos da API.
- [ ] Anexar as apólices ou disponibilizar links seguros, identificando os respectivos passageiros.
- [ ] Incluir número do pedido, dados principais do seguro e orientações de atendimento fornecidas pela seguradora.
- [ ] Definir a comunicação ao cliente em caso de emissão parcial ou falha.

### Controle de entrega

- [ ] Registrar fila, envio, falha e tentativas de reenvio por pedido e por tipo de e-mail.
- [ ] Usar processamento em fila, com retentativas e proteção contra mensagens duplicadas.
- [ ] Tratar devoluções e falhas de entrega conforme os recursos do provedor.
- [ ] Permitir reenvio manual autorizado pela dash e registrar a ação no histórico.

## 6. Complementos da dash e acompanhamento do cliente

- [ ] Exibir situação, identificadores e tentativas de pagamento, incluindo validade do Pix.
- [ ] Exibir a emissão e a apólice de cada passageiro.
- [ ] Disponibilizar download autorizado dos documentos.
- [ ] Exibir o histórico de cobrança, confirmação, emissão e e-mails.
- [ ] Diferenciar processamento interno, pagamento confirmado e apólice emitida.
- [ ] Definir o acompanhamento do pedido pelo cliente, usando link seguro ou autenticação apropriada.
- [ ] Definir permissões para reprocessamento, cancelamento, estorno, download e reenvio de e-mail.
- [ ] Definir o procedimento de cancelamento após pagamento ou emissão, incluindo o que deve ser feito no gateway e na API da seguradora.

## 7. Hospedagem e operação em produção

- [ ] Definir a hospedagem/VPS e os domínios definitivos do site e da dash.
- [ ] Configurar DNS, HTTPS e proxy reverso.
- [ ] Publicar os fontes atualizados e definir o processo de atualização/rollback.
- [ ] Configurar banco de produção, Redis, workers e agendamento das rotinas de conciliação.
- [ ] Aplicar migrações e validar os arquivos estáticos dos dois frontends.
- [ ] Configurar segredos de produção: API Site Vetra, gateway, e-mail, ingestão, Django, banco e criptografia de CPF.
- [ ] Configurar e validar a URL pública dos webhooks.
- [ ] Garantir que o site em produção acesse o backend de produção, sem dependência da máquina local.
- [ ] Definir se usuários e configurações locais serão migrados. Eles não são transferidos automaticamente para o banco de produção.
- [ ] Configurar backups do banco, dos documentos e das chaves necessárias para recuperar os dados; testar restauração.
- [ ] Configurar monitoramento, logs sem dados sensíveis e alertas de falhas.
- [ ] Revisar políticas de privacidade, cookies, retenção e exclusão dos contatos e documentos.
- [ ] Atualizar termos, condições e mensagens do checkout para o fluxo real de contratação.

## 8. Homologação e liberação

- [ ] Testar compra aprovada no cartão e pagamento Pix confirmado.
- [ ] Testar cartão recusado, Pix expirado, nova tentativa, cancelamento e estorno.
- [ ] Testar cupom, desconto Pix, parcelamento, juros e arredondamento dos centavos.
- [ ] Testar múltiplos passageiros e emissão parcial.
- [ ] Testar webhook duplicado, fora de ordem e não recebido.
- [ ] Testar indisponibilidade e resposta incerta da API, sem emissão duplicada.
- [ ] Testar falha no envio de e-mail e reenvio autorizado.
- [ ] Conferir as apólices e os e-mails recebidos, incluindo anexos ou links.
- [ ] Validar acessos e permissões da equipe.
- [ ] Executar uma compra controlada em produção usando a loja Site Vetra.
- [ ] Conferir o ciclo inteiro: pedido → captura do pagamento → emissão → documento → e-mail final.

## Ordem sugerida de execução

1. Confirmar as credenciais e os identificadores da loja Site Vetra.
2. Escolher o gateway e obter a documentação de pagamento, emissão e documentos.
3. Preparar a infraestrutura de produção/homologação e o serviço de e-mail.
4. Integrar cartão/Pix e confirmação por webhook, com conciliação.
5. Integrar emissão e obtenção da apólice pela API.
6. Integrar os e-mails e os controles operacionais da dash.
7. Homologar os cenários de sucesso e falha e liberar a produção.

O e-mail de pedido recebido pode ser implementado antes da integração de pagamento e emissão.

## Informações necessárias para iniciar as integrações

- Credenciais e identificadores da loja Site Vetra, configurados por canal seguro.
- Gateway escolhido, documentação e credenciais de homologação.
- Documentação da API para emissão, consulta de situação e obtenção da apólice.
- Serviço de e-mail escolhido, domínio e remetente desejados.
- Hospedagem/VPS e domínios de produção.

Este arquivo é um checklist de implementação e validação. Nenhuma credencial deve ser incluída nele.
