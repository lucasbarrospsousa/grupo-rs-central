# Gestão de chips — 13/10/2026

Armazém > Chips reúne Estoque e ativação, Mensalidades e vínculos e Acompanhar ativações. A visão geral mantém somente o resumo financeiro e o botão Chips. O painel financeiro detalha tarifas por provedor, operadora, APN e custo unitário, com quantidade e subtotal. Selecionar uma tarifa filtra os ICCIDs; a busca local aceita ICCID, série, placa, operadora e APN. A lista financeira tem paginação de 12 linhas e mostra aparelho, placa, situação e data da leitura.

APNs e vínculos vêm do cadastro SQL do aparelho. APN ausente não é inferida pelo provedor. ICCID com vários vínculos é contado uma vez e mostra todos os aparelhos/APNs. Valores do armazém usam os mesmos snapshots salvos, sem somar novamente esses itens à mensalidade da base. Valores ausentes não são zero.

Um cache por sessão/usuário e uma requisição em andamento compartilhada evitam leituras duplicadas ao navegar. Abrir e filtrar usam apenas GET de valores salvos; Atualizar Árya é uma ação explícita, mantém o limite existente e preserva a Link. Acompanhamento utiliza o fluxo existente, agora também dentro de Chips, com IDs distintos do painel legado.

Seleção de ativação somente para candidatos definidos em warehouse-activation-model.js e usuários com permissão. Limite de 10/20, seleção entre páginas, limpeza e indicador parcial no seletor da página. Preparados, solicitados, envios em conferência e respostas incertas permanecem desabilitados. O botão usa requestActivationLot, conservando a reserva no servidor e a proteção contra reenvio. Enquanto processa, bloqueia novos cliques; ao concluir ou falhar, limpa a seleção e orienta o acompanhamento. Não foi adicionada ativação automática ou alteração no backend.

Detalhes, classificação e remoção usam os fluxos existentes. As alterações confirmadas pelo servidor atualizam a lista a partir do recibo, sem nova leitura extensa. Movimentação de aparelhos permanece no Inventário.

Validação local com dados fictícios: 17 testes Node focados (chips, ativação, envio e resumo); teste de navegador test-warehouse-chips-inventory-ui.mjs (filtros sem consulta, preços em cache, limites, pendentes, clique duplo, cadastro, classificação, histórico, permissões, 1917×913, 1280×720 e 390×844); regressão test-warehouse-overview-ui.mjs. Transporte de ativação simulado e conexões externas bloqueadas no teste novo. Nenhum chip real ativado.
