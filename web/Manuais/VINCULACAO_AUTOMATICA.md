# Vinculação automática — 08/10/2026

A aba Vinculação foi retirada do menu. Estoque, Reserva e Manutenção possuem Vincular, com permissão de escrita do estoque. O menu de mais ações contém Lotes de vinculação; somente administradores cadastram faixas. Cada base e prefixo têm numeração independente; faixa inicial operacional 450–459, ampliável em lotes de até 1.000 números.

Tipos explícitos: V7.3.2 → GRS, V7.3.5 → XRS, V7.2.2/V7.1.6 → AAA. Modelo genérico RS300 bloqueia a escolha. O Configurador envia tracker_version apenas ao banco da Central, após autoteste com identidade confirmada. Clientes anteriores continuam aceitos e preservam tipo já salvo.

Ao cadastrar lote, consulta uma vez o titular único RS300 e guarda códigos das identificações existentes; faltantes são criadas somente quando utilizadas. O clique reserva um número no SQL com bloqueio, lê o código do aparelho salvo e registra intenção durável antes de enviar. Criação retorna o código da identificação; associação usa mover=false. Não há busca remota pré/pós-associação. Login pode ocorrer quando não há token.

HTTP e JSON são interpretados conjuntamente. Apenas sucesso explícito confirma; apenas mensagem específica de identificação ocupada avança (até 10 tentativas). Timeout, erro genérico e resposta inesperada preservam número e pedido pendente, sem reenvio. Operação confirmada salva Estoque, identificação e códigos. Mudança concorrente do cadastro impede a atualização local e exige conferência. Checkpoints enviados não são executados de novo, inclusive após interrupção do worker. Não existe retomada automática de envio incerto.

Execução em segundo plano usa EdgeRuntime.waitUntil. A tela consulta o estado SQL a cada 5 segundos enquanto montada e visível. Pendências antigas não são automaticamente reconciliadas pela rota legada. Um administrador deve conferir casos incertos; não apagar a reserva para forçar nova escrita.

Migração 038: link_targets com RLS por membership e numeração única por base/prefixo. Ferramentas: migrate-auto-link.mjs (rollback; --apply instala), test-auto-link-sql.mjs (fixtures revertidas; plataformas simuladas), test-auto-link-ui.mjs (Chrome com respostas sintéticas). Testes Node: auto-link.test.mjs, api-link.test.mjs, configurator.test.mjs. Suite completa: 303 testes. Teste real autorizado confirmou uma vinculação de Imperatriz em cerca de 6,9s; identificadores permanecem fora do repositório.
