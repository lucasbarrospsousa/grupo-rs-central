# Grupo RS Central — versão web

Esta pasta pertence ao repositório Grupo RS Central, mas não entra no executável Godot.
Leia MANUAL_TECNICO.md desta pasta antes de trabalhar. Herda as regras da raiz.

- Em 24/09/2026 Lucas autorizou SQL real no projeto Supabase existente, usando cópia atualizada como homologação, login equivalente e testes CRUD. Nunca confundir esse escopo com substituição do desktop ou testes de escrita nas plataformas operacionais.
- Não criar/conectar banco, importar dados, usar cofres ou ativar APIs reais sem autorização de Lucas.
- A demonstração deve identificar seu estado e não coletar senhas. Não transformar seu adaptador em autenticação de produção.
- Preservar série/ICCID como texto; consultas por série exata; mutações reais somente no servidor, com filial autorizada, transação e idempotência.
- Não exportar dados reais nem incluir dependências deste frontend no pacote Godot.
- Homologação: schema privado `central_homologacao`; credenciais e snapshots somente em `.secrets/homologacao/`. Os scripts SQL devem recusar sobrescrever uma importação existente. Dados/credenciais não entram em Git nem no pacote público de backup.
- Testes: `node --test web/tests/*.test.mjs` a partir da raiz do repositório. Servidor local: `node web/server.mjs`.
