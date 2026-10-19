# Documento reorganizado

O documento completo está em [CONFIGURADOR.md](Manuais/CONFIGURADOR.md). Organização de 27/09/2026.
# Séries sem prefixo fixo — 13/10/2026

A pré-conferência e o salvamento online aceitam séries como texto de nove dígitos, independentemente do prefixo. A validação anterior da Central ainda exigia 024 e bloqueava a configuração mesmo após a identificação física correta. Mantidas autorização da filial, conflitos de vínculo/chip, confirmação remota e idempotência. Teste focado: `node --test tests/configurator.test.mjs` a partir de `web/`, com quatro bases, diferentes prefixos e entradas inválidas; sem escrita operacional.

## Preparação paralela — 13/10/2026

A ação `prepare` recebe os mesmos dados/chave de `save`, valida permissão, filial e versão, e registra uma resposta pendente em `requests`. Não cria/atualiza equipamento nem consome chip do armazém. O Configurador a inicia em paralelo ao cadastro na plataforma após confirmar parâmetros físicos e dados do chip.

`save` mantém a conferência remota e só promove o recibo pendente após gravação/releitura transacional. A mesma chave retorna o resultado concluído em novas tentativas; payload divergente continua bloqueado. Ambas as etapas usam o lock existente. Sem migração SQL. A pendência fica no controle de requisições, não na lista de estoque confirmado. Validado por `node --test web/tests/configurator.test.mjs web/tests/configurator-pending.test.mjs` com SQL e plataforma simulados.
## Transferência confirmada pelo Configurador — 19/10/2026

Após confirmar série, ICCID e telefone na plataforma de destino, a Central transfere o mesmo ID interno, com versão otimista e recibo idempotente. Exige operador/administrador nas duas filiais. Duplicidade ativa, chip em outro aparelho e operação remota pendente impedem a transferência. Nenhuma exclusão é enviada aos portais externos.

O destino segue as regras existentes: Reserva em Imperatriz; Estoque nas demais bases. Dados de titular, placa e vínculos remotos da origem ficam no histórico, sem aparecer como vínculos atuais do destino. Auditoria registra as duas filiais, dados anteriores e observação completa. A migração 058 permite retirar apenas a observação de uma transferência autorizada, sem conceder escrita geral nessa tabela. O armazém acompanha a nova filial de uso do chip, mantendo suas movimentações.

A lista visível verifica alterações salvas a cada 10 segundos, sem chamar APIs externas. Não redesenha quando a página não mudou; suspende ao ocultar a aba, abrir modal, sair da tela ou perder a sessão. Permanecem os filtros, paginação e intervalos existentes das consultas de chip/comunicação.

Identificadores aceitos pelo endpoint: texto numérico de 9 ou 15 dígitos, sem restrição de prefixo; zeros iniciais são preservados.

Validação: `node --test web/tests/configurator.test.mjs web/tests/configurator-pending.test.mjs web/tests/saved-stock-watch.test.mjs`; `node web/tools/test-configurator-transfer.mjs` e `node web/tools/test-configurator-transfer.mjs --runtime`. Os testes SQL usam dados fictícios em transação com rollback, plataforma simulada e nenhum comando ao aparelho. O teste administrativo confere auditoria/observações; o de runtime usa as permissões SQL da aplicação e não amplia acesso ao histórico.
