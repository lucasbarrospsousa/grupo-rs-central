# Aparelhos: 50 por página e consulta em segundo plano

A página de estoque exibe até 50 aparelhos; Consulta de veículos mantém 10. A chave de cache da página inclui o tamanho, evitando reutilizar páginas antigas de 10 itens.

Uma única rodada de comunicação/chip por sessão acompanha os IDs da última página selecionada. Navegar para outra aba ou ocultar a guia não cancela a rodada. Ao retornar à mesma página, o monitor é reutilizado. Nova página/filtro substitui os alvos. Logout, nova sessão e troca de filial encerram o monitor; offline e pausa explícita continuam respeitados. O navegador deve permanecer aberto; suspensão do navegador/sistema pode atrasar timers.

As consultas continuam sequenciais por aparelho, comunicação e chip independentes, com até duas requisições internas em andamento. Mantidos orçamento e permissões do servidor e intervalo de 30 segundos após concluir a rodada. Não é uma consulta coletiva upstream: 50 aparelhos geram 100 solicitações internas por rodada; a quantidade externa depende do cache e das integrações. Atualizar aparelhos divide a página em cinco lotes de até dez, preservando o limite do endpoint.

Validação: teste simulado completa 50 aparelhos após navegação e guia oculta; confirma 100 solicitações, máximo de duas simultâneas, ausência de duplicação no retorno, cancelamento na troca de filial/logout. Navegador local confirma páginas 50/50/1 para 101 registros, com zero solicitações externas. Testes focados incluem filtros, paginação, cache, comunicação e fila. Não foi medido tempo real de fornecedor nem realizado teste de carga.
