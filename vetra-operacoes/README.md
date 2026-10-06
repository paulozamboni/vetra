# Vetra · Operações

Para hospedar **cotador + dashboard + API** na VPS, use o `compose.yaml` da pasta pai e o guia `../deploy/vps/README.md`. O Compose deste diretório é a configuração anterior restrita ao serviço de operações.

Primeira etapa do sistema operacional: Django 5.2, Django REST Framework e dashboard React/TypeScript. O cotador publicado continua em `../vetra-cotador`; este projeto é um serviço Python independente.

## Entregue nesta etapa

- Login de equipe por sessão, CSRF e limitação de tentativas.
- Perfis Operação, Financeiro e Gestão, verificados também pela API.
- Cadastro de pedidos com passageiros, CPF validado e criptografado, idade e valores individuais. O servidor calcula o total.
- Lista, busca, filtros por situação/período, paginação e detalhes com histórico.
- Cancelamento apenas de pedidos sem pagamento, com motivo e autoria registrados.
- Indicadores e relatório CSV com moedas separadas. Exportações não incluem CPF e neutralizam fórmulas de planilha.
- Demonstração isolada dos pedidos reais. Disponível somente em desenvolvimento.
- Estrutura Celery/Redis e chave única de processamento para a futura emissão.

Nenhuma cobrança, emissão de apólice, webhook de pagamento ou envio externo está ativo. Os estados financeiros exibidos na demonstração são fictícios. Pedidos novos entram como rascunho; a API não aceita alterar valores totais ou estado financeiro pelo cliente.

## Executar localmente

Python 3.12+ e Node 22.13+. Use pnpm 11.19.0 (`npm install -g pnpm@11.19.0`).

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe scripts/setup_local.py
cd frontend
pnpm install --frozen-lockfile
pnpm run build
cd ../backend
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\python.exe manage.py setup_roles
..\.venv\Scripts\python.exe manage.py collectstatic --noinput
..\.venv\Scripts\python.exe manage.py createsuperuser
..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8080 --noreload
```

Abra `http://127.0.0.1:8080/`. Para administrar equipe e grupos: `/admin/`. Usuários operacionais devem ser ativos, ter `is_staff=True` e um dos grupos acima. A administração de pedidos é somente leitura; alterações operacionais passam pela API auditada.

Opcionalmente, execute `manage.py prepare_preview` para gerar registros fictícios e um usuário restrito de demonstração. A senha aleatória é gravada apenas no arquivo local ignorado `.runtime/preview-access.json`. Esse comando recusa produção e não altera senhas existentes. Não compartilhe esse arquivo.

SQLite é usado exclusivamente na execução local simplificada. `compose.yaml` prepara PostgreSQL e Redis para um ambiente local equivalente à arquitetura planejada:

```powershell
docker compose up --build
docker compose exec web python manage.py createsuperuser
```

O Compose exige `.env` com `POSTGRES_PASSWORD` forte (gerada pelo setup local). Nenhuma porta do banco ou Redis é exposta ao host. Não mistura o banco SQLite com o PostgreSQL; cada ambiente tem seu próprio conjunto de pedidos.

## API desta etapa

| Endpoint | Uso |
| --- | --- |
| `GET /api/session/` | Sessão e token CSRF |
| `POST /api/login/` | Login com CSRF |
| `POST /api/logout/` | Encerrar sessão |
| `GET /api/summary/` | Indicadores, valores por moeda e movimento diário |
| `GET /api/orders/` | Lista paginada |
| `POST /api/orders/` | Cadastro operacional de rascunho |
| `GET /api/orders/{uuid}/` | Pedido, passageiros com CPF mascarado e histórico |
| `POST /api/orders/{uuid}/cancel/` | Cancelamento sem pagamento |
| `GET /api/orders/export/` | CSV conforme filtros e permissão |

Filtros: `scope=real|demo`, `search`, `status`, `start`, `end`, `page`. O período filtra a **data de criação do pedido**, não a data da viagem. Valores monetários são decimais e a moeda deve ser confirmada; não inferir BRL das tarifas da API Vetra enquanto essa informação estiver pendente.

Cadastro recebe: `customer_name`, `customer_email`, `destination`, `plan_name`, `plan_id` opcional, `departure`, `return_date`, `currency`, `payment_method` e `passengers[]` com `full_name`, `cpf`, `age`, `unit_price`. Tarifas individuais devem corresponder ao período completo. O formulário é cadastro operacional; não recalcula o preço pela API da seguradora nesta etapa.

## Validação

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
..\.venv\Scripts\python.exe manage.py test orders
cd ../frontend
pnpm run build
```

Os testes cobrem permissões, CSRF, CPF, total calculado, imutabilidade financeira, datas, isolamento da demonstração, cancelamento, exportação segura e unicidade da chave de processamento.

## Próximas etapas

1. Hospedar Django, PostgreSQL e Redis em infraestrutura apropriada, com domínio, HTTPS, backups e secrets próprios. O serviço Python não roda no ambiente Workers usado pelo cotador atual. Os arquivos Docker são preparação; provisionamento e testes com PostgreSQL/Redis não são pressupostos desta entrega local.
2. Publicar a integração de pedidos já implementada: configurar no cotador a URL HTTPS hospedada do Django e o token exclusivo de ingestão. O teste local não conecta o site publicado à máquina do usuário.
3. Implementar confirmação de pagamento por webhook autenticado e conciliação. Repetição do webhook não pode duplicar cobranças ou pedidos.
4. Conectar emissão Vetra (cliente 4, empresa 1418) após confirmação do pagamento. Guardar o estado de cada tentativa e consultar o provedor antes de repetir uma chamada de resultado incerto.
5. Habilitar workers, documentos de apólice, reprocessamento autorizado, notificações e relatórios financeiros conciliados.

Em produção, `DEBUG=0`, PostgreSQL e Redis são obrigatórios. Configure `DJANGO_SECRET_KEY`, `CPF_ENCRYPTION_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `DATABASE_URL` e `REDIS_URL`. Preserve e faça backup seguro da chave de CPF; trocá-la sem migração inviabiliza ler os CPFs existentes. Sessões usam cookies seguros e o servidor exige HTTPS. Um proxy TLS deve ser configurado e validado antes de liberar acesso público. Execute `manage.py check --deploy` nesse ambiente.

## Pedidos recebidos do cotador B2C

Implementado `POST /api/checkout/orders/`, exclusivo para o servidor B2C, com `Authorization: Bearer CHECKOUT_INGEST_TOKEN`. Não concede leitura de pedidos, login da equipe, pagamentos ou emissão. O cotador usa `VETRA_OPERATIONS_URL` e `VETRA_OPERATIONS_TOKEN` somente no servidor. Configure o mesmo token nos dois projetos, fora do código.

O checkout coleta contato, passageiros (nome, CPF e idade), período e preferência cartão/Pix, sem dados de cartão ou cobranças. O servidor B2C recota na Vetra antes de enviar, valida o plano/destino e rejeita mudanças do valor sem nova revisão. Guarda os IDs de cotação e plano da Vetra. O Django registra `source=checkout`, `is_demo=False`, `status=awaiting_payment`, CPF criptografado e histórico. UUID de envio único e conferência dos dados evitam duplicação ao tentar novamente. Não representa uma compra paga ou apólice vigente.

Quando a moeda da API não está confirmada, o pedido mantém `currency=XXX` e mostra “moeda a confirmar”. Nunca converter/inferir reais desse valor. A API retorna um total do grupo; os valores nos passageiros são rateio desse total com centavos preservados, não tarifas individuais. Gateway/emissão exigem futura conciliação, recotação e confirmação comercial da moeda.

Validação adicional: 19 testes Django e `node tests/orders.mjs` no projeto do cotador. Teste local servidor-a-servidor e envio pelo formulário confirmaram pedidos persistidos na área real, sem cobrança. Existem registros identificados como “Teste Integração Local” e “Teste Formulário Local”, com dados fictícios, para provar essa ligação.

Prévia: cotador em `http://127.0.0.1:5173/`, dashboard em `http://127.0.0.1:8080/`. O dashboard agora abre por padrão em pedidos reais; a demonstração continua acessível no seletor. Hospedagem pública do Django ainda precisa ser definida antes de ativar o fluxo no site publicado.

## Conversão USD → BRL

A moeda da tarifa da Vetra foi confirmada como USD. O cotador consulta `/cambio/detail-by-date/{data_em_Sao_Paulo}?cliente=4` e usa **cambio_ita**, conforme escolha comercial. Não usa a primeira linha da lista (que pode ser futura), outra fonte ou taxa fixa. Sem câmbio válido da data, a cotação fica indisponível e não envia pedido com valor ambíguo. Cache de cinco minutos é separado por data.

Preços de venda são exibidos em BRL no B2C. Limites de cobertura mantêm suas moedas contratuais. Cada pedido novo guarda `original_total` em USD, `total` em BRL, `exchange_rate`, `exchange_date`, `exchange_id`, `exchange_field=cambio_ita` e `exchange_fetched_at`. Lista, detalhes e CSV mostram o registro da conversão. O cálculo usa decimal exato e arredondamento HALF_UP em centavos; o Django confere a fórmula e a soma dos passageiros. Taxa e valores registrados não mudam com futuras cotações. Campos de cotação transitórios não quebram a deduplicação de reenvios.

Validação atual: 21 testes Django, testes de conversão decimal, API Vetra e checkout, build do dashboard e TypeScript do B2C. Nenhuma cobrança, pagamento ou emissão é realizada.
