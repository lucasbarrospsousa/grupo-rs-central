# Central: avaliacao em conta Cloudflare propria

Data: 20/10/2026. Escopo: interface e proxy HTTP; Supabase continua com API,
PostgreSQL, permissoes, sessoes e tarefas operacionais. Nao altera Sites, DNS,
dados, rotinas ou o aplicativo historico. Nao e uma migracao de producao.

## Arquitetura

Navegador -> Worker de avaliacao + public/ -> central-api no Supabase -> PostgreSQL.
O entrypoint independente importa o Worker atual. Antes de normalizar Origin
para o host canonico aceito pela API, exige mesma origem do navegador em POST.
Cookies, CSRF, idempotencia e validacao de permissoes continuam no caminho atual.
O segredo CENTRAL_BRIDGE_TOKEN deve ser cadastrado como secret no Worker; nunca
incluir no JSON Wrangler, frontend, Git, logs ou backup. Nao requer senha SQL,
service_role ou credenciais das operadoras na Cloudflare.

## Protecao da avaliacao

Somente login/logout/atividade e GETs explicitamente permitidos para dados salvos
podem atravessar o proxy. Login ainda grava sessao/limites/auditoria no Supabase.
Escritas operacionais, consulta externa, SMS e atualizacao de integracoes ficam
bloqueadas. Ausencia de segredo falha fechada. O desligamento administrativo
continua sendo consultado. Nenhum cron novo deve ser ativado.

Os botoes existentes de operacao podem retornar bloqueio nesta copia; isso nao
e evidencia de incompatibilidade da Cloudflare. Liberar uso operacional exige
concluir validacao e retirar deliberadamente a restricao em entrega posterior.

## Validacao local

Na pasta web:

    node --test tests/cloudflare-hosting.test.mjs tests/power-hosting.test.mjs tests/auth.test.mjs tests/startup-bundle.test.mjs tests/startup-unified.test.mjs

17 testes passaram com fetch simulado. Nenhuma API externa ou banco real acessado
nesses testes. A expectativa antiga de 16 paineis foi corrigida para os 17 atuais,
incluindo explicitamente o resumo de baixas. Testes de permissoes, sessoes
ausentes/expiradas, CSRF no transporte, mesma origem, bloqueios e carregamento
unificado foram preservados. Isso nao mede latencia nem capacidade em producao.

## Pendencias de publicacao

Build validado por Wrangler 4.45.0 com deploy --dry-run: Worker 4.88 KiB,
1.94 KiB gzip, binding ASSETS reconhecido. Pasta public: 149 arquivos, 7.63 MB.
O teste de build nao publicou e nao acessou API operacional.
Execucao local no runtime oficial via wrangler dev: styles.css 200 (109 ms),
mode.js 200 (10 ms), session sem secret 503 (19 ms), ativacao bloqueada 403
(13 ms). Medicoes locais pontuais, nao representam latencia na internet.
Compatibility date 2025-10-11 fixada para o runtime validado, sem fallback.
Autorizacao OAuth do Wrangler aberta; publicacao depende de autorizacao do usuario.

Publicar em workers.dev proprio, sem
substituir o dominio Sites. Autenticar Wrangler na conta escolhida; cadastrar
secret somente pelo canal protegido; configurar nome de avaliacao. Concluir
build no Wrangler e medir abertura/login/resumo com leituras autorizadas.
Nao afirmar atendimento de carga sem medir concorrencia, erros, CPU e latencia
do Supabase. Recursos estaticos e proxy leve sao compativeis com Workers; limites
da API/banco permanecem os atuais e nao aumentam por trocar a interface.

Configuracao: ../wrangler.central-test.json. Entry: ../hosting/cloudflare-entry.mjs.
Documentacao: https://developers.cloudflare.com/workers/static-assets/binding/
