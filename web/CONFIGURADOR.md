# Documento reorganizado

O documento completo está em [CONFIGURADOR.md](Manuais/CONFIGURADOR.md). Organização de 27/09/2026.
# Séries sem prefixo fixo — 13/10/2026

A pré-conferência e o salvamento online aceitam séries como texto de nove dígitos, independentemente do prefixo. A validação anterior da Central ainda exigia 024 e bloqueava a configuração mesmo após a identificação física correta. Mantidas autorização da filial, conflitos de vínculo/chip, confirmação remota e idempotência. Teste focado: `node --test tests/configurator.test.mjs` a partir de `web/`, com quatro bases, diferentes prefixos e entradas inválidas; sem escrita operacional.

## Preparação paralela — 13/10/2026

A ação `prepare` recebe os mesmos dados/chave de `save`, valida permissão, filial e versão, e registra uma resposta pendente em `requests`. Não cria/atualiza equipamento nem consome chip do armazém. O Configurador a inicia em paralelo ao cadastro na plataforma após confirmar parâmetros físicos e dados do chip.

`save` mantém a conferência remota e só promove o recibo pendente após gravação/releitura transacional. A mesma chave retorna o resultado concluído em novas tentativas; payload divergente continua bloqueado. Ambas as etapas usam o lock existente. Sem migração SQL. A pendência fica no controle de requisições, não na lista de estoque confirmado. Validado por `node --test web/tests/configurator.test.mjs web/tests/configurator-pending.test.mjs` com SQL e plataforma simulados.
