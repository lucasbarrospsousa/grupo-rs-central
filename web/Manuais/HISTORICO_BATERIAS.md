# Histórico de baterias — 22/10/2026

Aba Equipamentos > Histórico de baterias. Herda leitura do Estoque e acesso à filial. Somente leitura; não inclui novos direitos de escrita.

Captura respostas já obtidas por stockCommunication/equipmentLocation no adaptador guardedIntegrations. Nenhuma consulta adicional às plataformas; não altera intervalos. Apenas aparelhos cadastrados como Multi/Multioperadora (normalização de espaços), série exata, filial exata, não excluídos. Falha ao persistir não bloqueia comunicação e retorna battery_history_warning.

Supabase: migration 067, tabela privada battery_history, RLS por filial, endpoint GET /api/battery-history com autorização de módulo. Valores ausentes preservados como null; 0 V é leitura válida. Horários sem fuso são interpretados como -03:00. Duplicação impedida por aparelho/filial/data da comunicação. Não guarda nome, telefone, localização ou credenciais. Modelos são uma fotografia do cadastro na coleta.

Retenção: consulta/RLS limitadas aos últimos 30 dias; cron SQL central-battery-retention remove expirados a cada hora. Nenhum backfill. Não há coleta quando nenhuma consulta existente recebe telemetria; esta aba não inicia consultas de comunicação. Percentual não mede saúde/capacidade real em mAh.

Validação: tests/battery-history.test.mjs e testes stock-monitor/stock-live; teste transacional SQL com rollback; tela renderizada com respostas simuladas e rede externa bloqueada. Publicação usa os processos existentes de Edge Function e Worker.

## Gráfico por aparelho

Botão Ver gráfico em cada leitura. Consulta apenas battery_history, série exata e filial autorizada, últimos 30 dias. Paginação por id em lotes de 1000, sem limitar o gráfico às 50 linhas da tabela. Eixo esquerdo 0–100% (interna), direito em volts (externa); ordenação pela comunicação. Null e intervalos acima de duas horas quebram a linha. Valores zero são preservados. Não altera captura, consultas upstream ou permissões. Testes: battery-chart.test.mjs e battery-history.test.mjs; renderização local com rede externa bloqueada.

## Dashboard de frota — 22/10/2026

Substitui a tela inicial de leituras pelo painel aprovado no estilo da Central. Todos os aparelhos cadastrados como Multi/Multioperadora, inclusive sem histórico, por filial ou todas as filiais autorizadas. Recorte móvel de 20 dias, sem backfill, varredura externa ou alteração da retenção de 30 dias. Cobertura informa dias distintos com leitura e primeira/última comunicação; não presume continuidade.

Retirada confirmada: duas leituras consecutivas, externa ≥12 V e depois 0 V, interna inicial ≥95%, intervalo de no máximo duas horas. Episódio termina com retorno de alimentação, externa ausente ou lacuna acima de duas horas. Faixas ~90% [85,95) e ~80% [75,85); não infere passagem por faixa não observada. Um aparelho conta uma vez em cada indicador. Abaixo de 80% considera qualquer leitura interna do período, independente de episódio confirmado. Tempo por faixa usa a primeira ocorrência de cada aparelho e faixa, desde a última leitura alimentada, não desde um instante presumido de retirada. Não mede capacidade, saúde ou vida útil.

CTEs agregam no SQL, sem transportar a frota completa ao navegador. Tabela paginada de 20 aparelhos inclui todos os cadastrados; busca afeta a tabela, indicadores mantêm o recorte da filial. Ver eventos mostra ciclos confirmados, em páginas de 50. Zero nos indicadores não equivale a frota saudável se falta histórico. Permissão stock e memberships continuam verificadas no backend, inclusive em Todas autorizadas; RLS permanece ativo. Nenhuma migração necessária.

Validação: battery-dashboard/history/chart.test.mjs; tools/test-battery-dashboard-sql.mjs usa fixtures sintéticas em transação READ ONLY com rollback (não consulta provedores); Chrome local com rede externa bloqueada em 1917×917 e 390×844. Leitura real do agregado em 809 ms: cobertura limitada, sem inventar observações. Não salva dados de clientes nos testes/fontes.

## Aba retirada — 22/10/2026

Por solicitação do usuário, a aba Histórico de baterias foi removida da navegação e do roteador da Central. Dados salvos, coleta passiva já autorizada e permissões permanecem preservados para análise técnica, sem novas chamadas aos provedores. Os módulos visuais anteriores ficam inativos como referência no controle de versão. Estudos operacionais não são publicados no GitHub.
