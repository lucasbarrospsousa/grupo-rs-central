# Grupo RS Central — versão web

Esta pasta pertence ao repositório Grupo RS Central, mas não entra no executável Godot.
Leia MANUAL_TECNICO.md desta pasta antes de trabalhar. Herda as regras da raiz.

- Etapa autorizada: migração de interface e regras com dados sintéticos.
- Não criar/conectar banco, importar dados, usar cofres ou ativar APIs reais sem autorização de Lucas.
- A demonstração deve identificar seu estado e não coletar senhas. Não transformar seu adaptador em autenticação de produção.
- Preservar série/ICCID como texto; consultas por série exata; mutações reais somente no servidor, com filial autorizada, transação e idempotência.
- Não exportar dados reais nem incluir dependências deste frontend no pacote Godot.
- Testes: `node --test web/tests/*.test.mjs` a partir da raiz do repositório. Servidor local: `node web/server.mjs`.
