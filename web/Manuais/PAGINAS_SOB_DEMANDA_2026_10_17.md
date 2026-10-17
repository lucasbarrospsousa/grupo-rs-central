# Leituras por tela — 17/10/2026

Continuação da paginação de Estoque e do resumo da Visão geral. Layout, vínculos e regras de gravação preservados.

- Armazém: aparelhos (8), chips (7), movimentações (8) e ativações (20) por página. Indicadores, destinos e totais consideram a base inteira autorizada. Visão geral e análise mensal recebem resultados agregados. ICCIDs de um lote e histórico de um item são consultados ao abrir seus detalhes.
- Mensalidades: resumo separado das listas; 12 chips por página, filtros no servidor, totais e grupos calculados sobre todos os chips. Tarifas e faturas permanecem distintas. Preços do inventário consultam apenas os ICCIDs visíveis; essa leitura não acompanha o polling do estoque.
- Manutenções: indicadores agregados e 6 registros por página; exportação completa somente ao solicitar. O formulário consulta os aparelhos disponíveis quando aberto e pesquisa clientes sob demanda.
- Cadastro em massa: não carrega todos os aparelhos ao abrir; confere somente as séries do lote. A validação transacional do cadastro continua obrigatória.
- Consulta de veículos: 10 resultados por página, pesquisa global, seleção de cliente preservada. Telas de posições e trajetos continuam com a disponibilidade anterior, sem reativar integrações.
- SMS: restaura a última lista autorizada e valida o resultado da consulta existente por marcador; não muda envio, fila, periodicidade nem o limite anterior de 100 operações. Não foi introduzida paginação visual no painel.
- Logs: já consultavam páginas de 50 registros com filtros no servidor. Configurações e usuários permanecem em consultas próprias, sem carregar o estoque e sem persistir credenciais/controles administrativos.

As páginas usam IndexedDB vinculado à identidade, filiais e permissões validadas pela sessão. Logout limpa snapshots; no máximo 80 entradas persistidas por identidade, com validade de 24 horas. Mudanças confirmadas invalidam as páginas. Falhas de atualização são exibidas e não são convertidas em resultados vazios.

Não há migração SQL nem nova rotina de polling. Itens do armazém usam LIMIT/OFFSET no servidor e um marcador de revisão antes da consulta. Resumos e histórico ainda precisam ler os registros necessários no servidor para conservar as regras de cálculo; hash evita retransmitir respostas iguais, mas não elimina esse cálculo. A redução de tráfego não equivale a garantia de redução da fatura do provedor.

Validação: 122 testes focados; Chrome isolado com fixture sintética, cobrindo abas do armazém, paginação, pesquisa além da primeira página, valores, foco dos filtros, manutenção, consulta e cadastro em massa. Consulta SQL curta, transação somente leitura, conferiu formato e limites das novas respostas. Nenhum SMS, ativação ou consulta a fornecedor foi executado nos testes.

Fixture: `node web/tools/paging-fixture.mjs` (porta 4188, dados fictícios, sem credenciais).
