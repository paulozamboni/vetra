# Deploy Vetra em uma VPS

Este ambiente sobe o **cotador B2C + Django/dashboard + worker Celery + PostgreSQL + Redis + Caddy**. Os dois frontends são compilados durante o build. O cotador usa Node standalone; o dashboard React é servido pelo Django/Gunicorn e WhiteNoise. O Caddy entrega HTTPS e renova os certificados. Somente 80/443 são publicados; banco, Redis e aplicações ficam sem portas públicas.

Esta preparação não publica nada na VPS nem altera o site atualmente hospedado no Sites. Pagamentos e emissão de apólices continuam desabilitados. Para este deploy usar **o compose.yaml da raiz**, não o Compose antigo de vetra-operacoes.

## 1. Preparar a VPS e o DNS

Use uma VPS Linux com Docker Engine e plugin Docker Compose, conforme a [instalação oficial](https://docs.docker.com/engine/install/ubuntu/). O Node precisa da mesma arquitetura no build e runtime; construa as imagens na VPS. Reserve espaço para banco, imagens e backups. Configure dois domínios distintos, por exemplo `seguro.suaempresa.com.br` e `operacoes.suaempresa.com.br`, apontando para a VPS. Abra TCP 80/443 e SSH; UDP 443 é opcional para HTTP/3. Remova AAAA do DNS caso a VPS não tenha IPv6 funcional.

Envie a pasta completa contendo `compose.yaml`, `deploy/`, `vetra-cotador/` e `vetra-operacoes/`. Não envie `.env.local`, `.env` de desenvolvimento, bancos SQLite, `.runtime`, `.sites-runtime`, `.venv`, `node_modules`, `dist`, `.git` ou credenciais de prévia. Os `.dockerignore` também impedem que esses arquivos entrem nas imagens.

Para criar um ZIP somente com os fontes necessários, execute `python deploy/vps/package_source.py` na sua máquina e envie `deploy/vps/artifacts/vetra-vps.zip`. Extraia na VPS e siga as próximas etapas. O empacotador exclui credenciais locais e bancos; o `.env` de produção é criado separadamente na VPS.

## 2. Configurar o ambiente

Na raiz do projeto, execute uma única vez:

```sh
python3 deploy/vps/init_env.py
chmod 600 deploy/vps/.env
```

O script gera segredos novos e recusa sobrescrever um arquivo existente. Edite `deploy/vps/.env`: `SITE_DOMAIN`, `OPS_DOMAIN`, `TLS_EMAIL`, `VETRA_API_LOGIN` e `VETRA_API_PASSWORD`. As credenciais são as exclusivas da Vetra; a integração mantém cliente 4 e empresa 1418. Google é opcional. Use aspas simples em valores que contenham `$` ou `#`, conforme a sintaxe de arquivos env do Compose. A senha PostgreSQL gerada é hexadecimal para ser segura na URL do banco; se substituir, mantenha esse formato.

Não execute `docker compose config` sem `--quiet` em terminais compartilhados: sua saída contém os segredos interpolados. Nunca coloque este `.env` no Git. Guarde uma cópia protegida fora da VPS, especialmente `CPF_ENCRYPTION_KEY`: sem ela não será possível recuperar os CPFs do backup.

## 3. Subir e criar o administrador

Todos os comandos abaixo são executados na raiz do projeto:

```sh
docker compose --env-file deploy/vps/.env config --quiet
docker compose --env-file deploy/vps/.env build
docker compose --env-file deploy/vps/.env up -d
docker compose --env-file deploy/vps/.env ps -a
docker compose --env-file deploy/vps/.env logs --tail=100 migrate operations cotador proxy
docker compose --env-file deploy/vps/.env exec operations python manage.py createsuperuser
```

O serviço `migrate` executa migrações, cria os perfis de equipe e confere as configurações de produção. Web/worker aguardam sua conclusão; o cotador aguarda a saúde da API. Se migrate falhar, consulte seus logs e corrija antes de liberar acesso. Saída `Exited (0)` nesse serviço é esperada. Nenhum usuário ou senha de demonstração é criado em produção.

Abra `https://SITE_DOMAIN` e `https://OPS_DOMAIN`. Administração da equipe: `https://OPS_DOMAIN/admin/`. Operadores precisam de `is_staff=True` e grupo Operação, Financeiro ou Gestão. O superusuário serve para a configuração inicial; crie contas individuais para a equipe.

O token de ingestão é compartilhado apenas entre o cotador e o Django, por variáveis privadas. O cotador chama `http://operations:8080` na rede Docker; essa é a única origem HTTP interna autorizada no modo Node. Todas as URLs externas usam HTTPS. A API/Django e o cotador confiam nos cabeçalhos do proxy apenas porque suas portas não são publicadas. Não exponha 3000/8080 nem monte o socket Docker em outros containers.

## 4. Validar o fluxo

1. Abra o site pelo domínio HTTPS e faça uma cotação.
2. Confira o preço em reais, câmbio ITA e seleção do plano.
3. Adicione passageiros; idade em branco usa a do primeiro apenas para estimativa. Para enviar, preencha as idades reais, nomes, CPFs válidos e o contato.
4. Envie um pedido de validação autorizado e confira no dashboard: aguardando pagamento, valor USD, BRL e taxa/data. Nenhuma cobrança ou apólice deve ser gerada.
5. Faça login, logout e exportação CSV. Confirme que uma conta sem permissão não acessa pedidos.

Este PostgreSQL é um banco novo: pedidos/usuários do SQLite local **não são copiados automaticamente**. Migração de dados existentes deve ser planejada separadamente, preservando a chave de CPF que os criptografou.

## 5. Atualizar e acompanhar

Antes de cada atualização, faça backup do banco e preserve o `.env` de produção. Envie os fontes novos sem sobrescrever esses arquivos e execute:

```sh
docker compose --env-file deploy/vps/.env build
docker compose --env-file deploy/vps/.env up -d --force-recreate migrate
docker compose --env-file deploy/vps/.env up -d
docker compose --env-file deploy/vps/.env ps -a
```

O `up -d` não apaga volumes. Não use `down -v`: remove banco e certificados. Healthchecks detectam falhas, mas o Docker não reinicia automaticamente um container apenas por estar unhealthy; acompanhe `ps`, logs e alertas da VPS. Logs têm rotação. Os volumes guardam PostgreSQL, Redis e certificados Caddy. Celery já está disponível para futuras tarefas; nenhuma integração de emissão/pagamento é habilitada pelo deploy.

## 6. Backup e restauração

Na VPS Linux, faça backup antes de migrar:

```sh
mkdir -p deploy/vps/backups
chmod 700 deploy/vps/backups
docker compose --env-file deploy/vps/.env exec -T postgres pg_dump -U vetra -d vetra -Fc > "deploy/vps/backups/vetra-$(date +%Y%m%d-%H%M%S).dump"
```

Copie o dump e uma cópia protegida do `.env` para armazenamento externo com acesso restrito. Agende backups na VPS e teste restauração em um banco separado. Redis não substitui o backup PostgreSQL.

Para recuperar em **uma instalação nova vazia**, com o mesmo `CPF_ENCRYPTION_KEY` do backup:

```sh
docker compose --env-file deploy/vps/.env up -d postgres redis
docker compose --env-file deploy/vps/.env exec -T postgres pg_restore -U vetra -d vetra --no-owner --no-acl --exit-on-error < caminho/backup.dump
docker compose --env-file deploy/vps/.env up -d
```

Não restaure por cima de um banco em uso. Preserve uma imagem/fontes correspondentes à versão do backup; o deploy aplica migrações pendentes após a restauração.

## Validação desta preparação

O build Node standalone, a configuração Compose e os testes de aplicação foram verificados localmente. Docker Engine não está instalado neste computador: build das imagens Linux, PostgreSQL/Redis em containers, certificados TLS e o fluxo completo pela VPS ainda exigem a primeira execução nesse ambiente. Não há deploy remoto realizado.

Validação local: 24 testes Django, testes da ingestão de pedidos, smoke test do servidor standalone (página e origem HTTPS atrás do proxy), TypeScript e `docker-compose config --quiet` usando o validador oficial. Nenhum segredo real é necessário para os testes de configuração.

Referências: [Docker Compose em produção](https://docs.docker.com/compose/how-tos/production/) e [Node standalone do vinext](https://github.com/cloudflare/vinext#nodejs-standalone-output).
