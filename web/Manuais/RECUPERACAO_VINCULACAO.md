# Recuperação de vinculação após conflito — 26/10/2026

Ao clicar novamente em Vincular selecionados, uma operação automática pendente por HTTP 409 na etapa de associação pode ser retomada. O servidor verifica a versão do cadastro, a reserva da identificação, o aparelho livre e o veículo livre pertencente exclusivamente ao titular RS300.

A operação anterior permanece no histórico como cancelada, com referência à sucessora. Uma nova operação é registrada na mesma transação, mantendo a reserva. A fila existente executa o envio com sua proteção contra duplicidade. Falhas de leitura, vínculos ocupados, respostas ambíguas e operações com resultado incerto não autorizam reenvio.

Permissões e escopo de filial continuam sob os controles existentes. A publicação não dispara associações: é necessário novo clique do usuário.

Validação offline: node --test web/tests/auto-link-retry.test.mjs web/tests/auto-link.test.mjs web/tests/api-link.test.mjs (23 testes). Integrações simuladas; nenhum vínculo real executado nos testes.
