# Controle econômico das leituras — 27/09/2026

## Escopo entregue
Controlador das leituras automáticas da interface. Não é um medidor de cobrança nem um bloqueio global da cota do Supabase. Não armazena registros operacionais, nomes ou credenciais: somente horários e quantidades reservadas localmente.

- Teto conservador de 120 reservas de chamadas por hora e 1.000 nas últimas 24 horas, por origem/navegador. Um lote do Vendas reserva 3 chamadas; estoque da Central reserva a quantidade de linhas visíveis.
- Contadores compartilhados entre abas via localStorage e Web Locks. Sem Web Locks, o controle é de melhor esforço; navegadores diferentes não compartilham orçamento. Limpar dados do navegador reinicia o contador. Não é um controle de segurança.
- Abas ocultas ou navegador offline não iniciam novas leituras periódicas. Requisições já em andamento podem terminar.
- Falhas das consultas aguardadas dobram o intervalo até 30 minutos; sucesso restaura o intervalo básico. A fila de estoque mantém seu controle de falhas próprio.
- Pausa manual persistente e contador acessíveis em “Consumo econômico ativo”, no canto inferior direito. Ao consumir o teto, a janela móvel libera novas reservas gradualmente.
- Gravações, autenticação, auditoria, carregamento inicial, filtros e atualização manual não passam por esse bloqueio. SMS e rotinas no servidor não foram alterados. A sincronização e a criação dos backups continuam como antes.

## Intervalos básicos
| Consulta | Antes | Agora |
| --- | --- | --- |
| Vendas: registros + métricas + saúde | 30 s | 120 s |
| 24 Horas: registros | 15 s | 120 s |
| Central: configurações / saúde | 15 s | 120 s |
| Central: estado da sincronização | 60 s | 300 s |
| Central: estoque visível | 60 s | 180 s |
| Central e 24 Horas: estado dos backups | 60 s | 600 s |

São intervalos mínimos, sujeitos a visibilidade, orçamento e recuo por falhas. Os percentuais de redução de frequência não representam redução medida de GB ou de cobrança.

## Limites que continuam pendentes
O contador oficial de saída, ingestão de logs, tamanho do banco e demais cotas não está conectado ao controlador. Não há garantia de que o consumo total da organização fique abaixo das cotas: usuários, tarefas do servidor, ações manuais e outras integrações também consomem. O banco de 24 Horas continua no Firebase; seus backups usam serviço no Supabase.

Conforme a documentação do Supabase consultada em 27/09/2026, Free não é cobrado, mas exceder cotas pode restringir serviços. Não houve alteração de plano, cobrança ou Spend Cap nesta entrega. O painel de uso oficial é a referência. Spend Cap do Pro não cobre todos os produtos.

Fontes: https://supabase.com/docs/guides/platform/cost-control e https://supabase.com/docs/guides/platform/manage-your-usage/egress

## Validação
Testes unitários: orçamento compartilhado, janelas de hora/dia, pausa, armazenamento inválido/bloqueado, custo inválido e recuo. Teste de navegador isolado: aba oculta, pausa/retomada, ação manual liberada, falhas, teto esgotado e encerramento do polling. Regressão visual com dados sintéticos nas três plataformas; sem escrita em bancos de produção.
