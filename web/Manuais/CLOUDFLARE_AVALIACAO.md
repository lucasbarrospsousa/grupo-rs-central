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

Somente login/logout/atividade/auditoria de interface e GETs explicitamente permitidos para dados salvos
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

## Publicacao e verificacoes

Build validado por Wrangler 4.45.0 com deploy --dry-run: Worker 4.88 KiB,
1.94 KiB gzip, binding ASSETS reconhecido. Pasta public: 149 arquivos, 7.63 MB.
O teste de build nao publicou e nao acessou API operacional.
Execucao local no runtime oficial via wrangler dev: styles.css 200 (109 ms),
mode.js 200 (10 ms), session sem secret 503 (19 ms), ativacao bloqueada 403
(13 ms). Medicoes locais pontuais, nao representam latencia na internet.
Compatibility date 2025-10-11 fixada para o runtime validado, sem fallback.
Publicado em 20/10/2026: https://grupo-rs-central-avaliacao.lucasbarrospereira13.workers.dev
Worker grupo-rs-central-avaliacao, versao inicial 5de97a97-9cdc-483b-b180-1970592cafb4.
Segredo da ponte cadastrado pelo stdin do Wrangler sem exibir valor. Nao houve
alteracao da API, banco, dominio Sites, agendamentos ou permissao dos usuarios.
Nao foi contratado plano pago.

Verificacao HTTPS: / 200 em 2076 ms, /styles.css 200 em 237 ms, /api/session sem
sessao 401 em 1677 ms, rota de ativacao bloqueada 403 em 210 ms. Amostra unica
feita do computador local, sem teste de carga; inclui latencia de rede/Supabase.
Tela de login e logos originais conferidas no navegador. Login real de lucasabm
confirmado. Resource Timing: login 2551 ms; session 2573 ms; resumo 4738 ms.
Do inicio do POST login ate fim do resumo: 9950 ms (nao inclui tempo digitando).
Bundle em segundo plano: 11742 ms. Sao amostras unicas, nao percentis de carga.
Visao geral exibiu dados salvos e graficos; cinco abas do Armazem abriram.
Status de backup/sincronizacao e custos GET consultam somente SQL; foram
incluidos na lista permitida. POST de custos continua bloqueado. Auditoria
ui-event autorizada preserva controles de permissao/CSRF e evita falso aviso.
Backup e auditoria retornaram 200 apos ajuste. Operacoes externas seguem bloqueadas.
Nao houve teste de escrita operacional nem de concorrencia; viabilidade funcional
da interface confirmada, capacidade de pico e ganho relativo ao Sites nao medidos.

Nao afirmar atendimento de carga sem medir concorrencia, erros, CPU e latencia
do Supabase. Recursos estaticos e proxy leve sao compativeis com Workers; limites
da API/banco permanecem os atuais e nao aumentam por trocar a interface.

Configuracao: ../wrangler.central-test.json. Entry: ../hosting/cloudflare-entry.mjs.
Documentacao: https://developers.cloudflare.com/workers/static-assets/binding/
