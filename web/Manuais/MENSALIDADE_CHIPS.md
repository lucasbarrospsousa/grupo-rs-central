# Mensalidade dos chips — Armazém web

O painel soma cada ICCID único vinculado aos aparelhos não excluídos/inativos da filial. Séries e ICCIDs são texto; valores são centavos inteiros. Vínculos repetidos não duplicam a cobrança. Trata-se de estimativa recorrente, sem excedentes ou ajustes de fatura.

## Fontes e conservação dos valores

- Árya: exportação autenticada `/customer/inventary/export`; coluna `VALOR NEGOCIADO`, estado `ATIVO`.
- Link Solutions / LSM: consulta somente de leitura `POST /api/sims/findAllByListICCID`, com uma lista de até 100 ICCIDs por lote. Usa `item__base_price`, apresentado como preço de venda no portal; nunca `boughtplan__base_price`, o custo de compra do plano. Considera fase `Vinculado` com início de cobrança informado; Online/Standby não determinam atividade contratual.
- A carga inicial da Link recebe apenas ICCIDs atualmente cadastrados e não inativos nas bases acessíveis, ausentes na Árya. Não varre o inventário completo da Link. Correspondência estritamente exata; registros históricos com sufixos são ignorados.
- A pedido do usuário, os valores Link são preservados após a carga inicial. A atualização da Árya nunca reconsulta os chips Link. Não há rotina noturna ou consulta automática adicional para preços Link.
- Cada lote Link concluído é salvo, inclusive ausência de correspondência; se a carga inicial falhar, retoma apenas ICCIDs ainda não consultados. Novos chips sem correspondência Árya após o encerramento da carga Link ficam pendentes, sem atribuição automática de provedor/preço.

## SQL e API

Migração `051_chip_cost_snapshots.sql`: snapshots privados por provedor, contendo os dados normalizados de cada chip (ICCID, preço, situação, operadora, plano e data), data da consulta, erro e trava temporária. A tabela não contém credenciais, telefone ou dados pessoais do cliente. RLS permite somente o administrador principal.

`GET /api/warehouse-costs?branch=...` calcula com os dados salvos e os vínculos atuais da filial, sem chamadas externas. `POST` atualiza a Árya quando tiverem passado 30 minutos e conclui a carga inicial Link apenas enquanto ela não estiver concluída. Ambas as rotas exigem administrador e acesso à filial; POST exige origem e CSRF válidos.

Travas SQL evitam atualizações simultâneas; tentativas têm intervalo mínimo de dois minutos. Falhas preservam preços e datas anteriores e tornam explícita a atualização pendente. Valores ausentes, dados ainda não consultados, chips inativos e conflitos entre provedores não entram silenciosamente no total.

O card mostra total, cobertura, subtotal/data por provedor e apenas contadores relevantes. Todas as tarifas estão na expansão, sem corte nas três maiores; busca por ICCID/série usa os dados já recebidos. A aba de chips reutiliza esse resultado. O botão atualiza a Árya; abrir/reabrir a página não consulta operadoras.

## Validação focada

- `node --test web/tests/warehouse-costs.test.mjs`: centavos, proveniência, duplicidade, lotes exatos, permissões, ausência versus falha e total combinado.
- `node web/tools/migrate-chip-costs.mjs`: persistência SQL com fixtures fictícias revertidas; `--apply` instala a migração se ausente e verifica também a RLS com a conexão do runtime.
- `node web/tools/test-warehouse-overview-ui.mjs` e `node web/tools/test-warehouse-chips-inventory-ui.mjs`: respostas sintéticas, cache, filtros, permissões, responsividade e ações existentes. Nenhuma ativação real.
