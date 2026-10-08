# Vinculação automática — 08/10/2026

A aba Vinculação foi retirada do menu. Estoque, Reserva e Manutenção possuem Vincular, com permissão de escrita do estoque. O menu de mais ações contém Lotes de vinculação; somente administradores cadastram faixas. Cada base e prefixo têm numeração independente; faixa inicial operacional 450–459, ampliável em lotes de até 1.000 números.

Tipos explícitos: V7.3.2 → GRS, V7.3.5 → XRS, V7.2.2/V7.1.6 → AAA. Modelo genérico RS300 bloqueia a escolha. O Configurador envia tracker_version apenas ao banco da Central, após autoteste com identidade confirmada. Clientes anteriores continuam aceitos e preservam tipo já salvo.

Ao cadastrar lote, consulta uma vez o titular único RS300 e guarda códigos das identificações existentes; faltantes são criadas somente quando utilizadas. O clique reserva um número no SQL com bloqueio, lê o código do aparelho salvo e registra intenção durável antes de enviar. Criação retorna o código da identificação; associação usa mover=false. Não há busca remota pré/pós-associação. Login pode ocorrer quando não há token.

HTTP e JSON são interpretados conjuntamente. Apenas sucesso explícito confirma; apenas mensagem específica de identificação ocupada avança (até 10 tentativas). Timeout, erro genérico e resposta inesperada preservam número e pedido pendente, sem reenvio. Operação confirmada salva Estoque, identificação e códigos. Mudança concorrente do cadastro impede a atualização local e exige conferência. Checkpoints enviados não são executados de novo, inclusive após interrupção do worker. Não existe retomada automática de envio incerto.

Execução em segundo plano usa EdgeRuntime.waitUntil. A tela consulta o estado SQL a cada 5 segundos enquanto montada e visível. Pendências antigas não são automaticamente reconciliadas pela rota legada. Um administrador deve conferir casos incertos; não apagar a reserva para forçar nova escrita.

## Seleção e fila por filial

Os checks alimentam **Vincular selecionados**, até 50 aparelhos por pedido. Itens inválidos recebem motivo individual; os demais continuam. Números são reservados uma vez, inclusive sob cliques concorrentes. A fila mantém no máximo duas operações em execução por base, compartilhadas entre usuários, abas e instâncias do servidor. Bases diferentes podem executar em paralelo. A autorização do solicitante é reavaliada antes de retirar o item da fila.

Workers processam a fila por até 45 segundos antes de parar de retirar novos itens. O tick autenticado existente de estoque retoma somente pedidos autorizados ainda não enviados, inclusive com a página fechada. Operações interrompidas após a retirada da fila ficam para conferência após 15 minutos; não há reenvio. O polling da tela apenas lê SQL, mostrando Na fila, Vinculando, Vinculado, Cancelado ou Conferir vínculo, e atualiza a lista após confirmação.

**Cancelar vinculações** atua na filial aberta e independe dos checks: cancela todos os pedidos ainda não enviados e libera suas reservas. Uma operação já enviada termina sua tentativa atual; se houver placa ocupada, não tenta outro número. Respostas confirmadas são gravadas normalmente. Respostas incertas mantêm pedido e número reservados para conferência; cancelamento não desfaz vínculos existentes. A ação é auditada.

Validação adicional: `node web/tools/test-auto-link-queue-sql.mjs` cria/remova apenas fixtures em duas filiais QA descartáveis, usa o papel SQL da aplicação e simula integralmente as plataformas. Testa concorrência entre clientes, idempotência, falhas parciais, abandono, timeout e cancelamento durante uma requisição. `test-auto-link-batch-ui.mjs` verifica a tela real com API simulada em 1917×913, seleção, progresso AJAX, cancelamento e atualização da lista.

Migração 038: link_targets com RLS por membership e numeração única por base/prefixo. Ferramentas: migrate-auto-link.mjs (rollback; --apply instala), test-auto-link-sql.mjs (fixtures revertidas; plataformas simuladas), test-auto-link-ui.mjs (Chrome com respostas sintéticas). Testes Node: auto-link.test.mjs, api-link.test.mjs, configurator.test.mjs. Suite completa: 303 testes. Teste real autorizado confirmou uma vinculação de Imperatriz em cerca de 6,9s; identificadores permanecem fora do repositório.
