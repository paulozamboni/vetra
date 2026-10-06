# Vetra

Projeto Vetra com cotador de seguro viagem, sistema de operações e implantação em VPS.

- [Cotador B2C](vetra-cotador/README.md): site React/TypeScript com integração de cotação.
- [Operações](vetra-operacoes/README.md): backend Django e dashboard React.
- [Implantação em VPS](deploy/vps/README.md): Docker Compose, PostgreSQL, Redis e Caddy.

Para implantação, utilize `compose.yaml` na raiz e siga o guia de VPS. Configure as credenciais no servidor a partir dos arquivos `.env.example`. Segredos e bancos locais não fazem parte do repositório.
