# Inventário de chips — 13/10/2026

Armazém > Chips usa a apresentação aprovada: categorias Estoque, Reserva e Emergência, total disponível no armazém, busca local, filtros de categoria/provedor/situação, sete linhas por página e ações por item. Estoque apresenta “Chips disponíveis para uso”. O cadastro abre diretamente no tipo Chip. Inventário de aparelhos, movimentações e análise mensal mantêm seus fluxos.

Os dados continuam vindo do repositório existente. Busca, filtros, paginação e seleção não consultam provedores. Mensalidades reaproveitam a última consulta de valores da base autorizada ao administrador, em memória na sessão; ICCIDs sem preço confirmado mostram “A consultar”. A coluna não supõe preço zero, não estima tarifa e não dispara exportações. O atalho Ver valores da base abre o painel existente; consultar valores permanece uma ação explícita.

Seleção de ativação somente para candidatos definidos em warehouse-activation-model.js e usuários com permissão. Limite de 10/20, seleção entre páginas, limpeza e indicador parcial no seletor da página. Preparados, solicitados, envios em conferência e respostas incertas permanecem desabilitados. O botão usa requestActivationLot, conservando a reserva no servidor e a proteção contra reenvio. Enquanto processa, bloqueia novos cliques; ao concluir ou falhar, limpa a seleção e orienta o acompanhamento. Não foi adicionada ativação automática ou alteração no backend.

Detalhes, classificação e remoção usam os fluxos existentes. As alterações confirmadas pelo servidor atualizam a lista a partir do recibo, sem nova leitura extensa. Movimentação de aparelhos permanece no Inventário.

Validação local com dados fictícios: 17 testes Node focados (chips, ativação, envio e resumo); teste de navegador test-warehouse-chips-inventory-ui.mjs (filtros sem consulta, preços em cache, limites, pendentes, clique duplo, cadastro, classificação, histórico, permissões, 1917×913, 1280×720 e 390×844); regressão test-warehouse-overview-ui.mjs. Transporte de ativação simulado e conexões externas bloqueadas no teste novo. Nenhum chip real ativado.
