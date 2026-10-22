# Histórico de baterias — 22/10/2026

Aba Equipamentos > Histórico de baterias. Herda leitura do Estoque e acesso à filial. Somente leitura; não inclui novos direitos de escrita.

Captura respostas já obtidas por stockCommunication/equipmentLocation no adaptador guardedIntegrations. Nenhuma consulta adicional às plataformas; não altera intervalos. Apenas aparelhos cadastrados como Multi/Multioperadora (normalização de espaços), série exata, filial exata, não excluídos. Falha ao persistir não bloqueia comunicação e retorna battery_history_warning.

Supabase: migration 067, tabela privada battery_history, RLS por filial, endpoint GET /api/battery-history com autorização de módulo. Valores ausentes preservados como null; 0 V é leitura válida. Horários sem fuso são interpretados como -03:00. Duplicação impedida por aparelho/filial/data da comunicação. Não guarda nome, telefone, localização ou credenciais. Modelos são uma fotografia do cadastro na coleta.

Retenção: consulta/RLS limitadas aos últimos 30 dias; cron SQL central-battery-retention remove expirados a cada hora. Nenhum backfill. Não há coleta quando nenhuma consulta existente recebe telemetria; esta aba não inicia consultas de comunicação. Percentual não mede saúde/capacidade real em mAh.

Validação: tests/battery-history.test.mjs e testes stock-monitor/stock-live; teste transacional SQL com rollback; tela renderizada com respostas simuladas e rede externa bloqueada. Publicação usa os processos existentes de Edge Function e Worker.
