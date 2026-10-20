# Central na Cloudflare — 20/10/2026

Produção: https://grupo-rs-central-avaliacao.lucasbarrospereira13.workers.dev

O nome técnico conserva `avaliacao` para preservar o endereço já autenticado. Foi promovido a produção com `wrangler.central-production.json` e `CENTRAL_HOSTING_MODE=production`. O perfil `wrangler.central-test.json` continua restrito; não usar esse perfil para publicar produção.

## Arquitetura e proteção

Interface e proxy HTTP executam na conta Cloudflare do usuário. As requisições de API seguem diretamente ao Supabase existente; o site ChatGPT não é intermediário. A origem antiga presente no adaptador é apenas a identidade canônica exigida pela API: primeiro é validada a origem real do navegador, depois são normalizados URL e Origin. Cookies, CSRF, idempotência, corpo, método, filial e erros de permissão permanecem intactos.

Banco, sessões, regras de acesso, integrações, agendamentos, backups e monitoramento permanecem no Supabase. Nenhuma migração SQL, duplicação de cron ou alteração de credenciais de usuários foi realizada. O segredo de ponte continua exclusivo do Worker. Não existem permissões adicionais concedidas pelo modo produção: as decisões continuam no backend original.

## Publicação e retorno

Publicar a partir de `web` com Wrangler: `wrangler deploy --config wrangler.central-production.json`, autenticado na conta existente. Não publicar o segredo em Git nem passá-lo como argumento. A primeira versão promovida foi `646a7494-41a1-4200-9723-72e6a75b9743`.

Retorno disponível em https://grupo-rs-central.lucasbarrosp.chatgpt.site — versão Sites preservada, sem nova publicação. Para retorno operacional, restaurar o link Central no Portal para esse endereço. Ambos usam o mesmo banco; não restaurar backup de banco para trocar hospedagem. Sessões são independentes por domínio e podem exigir login. Evitar operar simultaneamente nos dois endereços.

Para restabelecer só o bloqueio de avaliação da Cloudflare, publicar o perfil de teste ou restaurar a versão `414a5b4e-4cdf-4bfd-b273-c9bf125c0d5b`. Isso não altera dados no Supabase.

## Validação

18 testes locais passaram: transporte de GET/POST/PUT/PATCH/DELETE com respostas simuladas, rejeição de origens inválidas, preservação de cookie/CSRF/idempotência, propagação de negativa do backend, login, membros/permissões e carregamento unificado. Nenhum comando operacional real foi usado nesses testes. A navegação autenticada e as leituras reais salvas são verificadas separadamente; os testes não são uma medição de carga nem uma validação de todas as integrações externas.
