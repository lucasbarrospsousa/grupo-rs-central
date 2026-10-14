# Gestão de chips — 13/10/2026

Armazém > Chips reúne Estoque e ativação, Mensalidades e vínculos e Acompanhar ativações. A visão geral mantém somente o resumo financeiro e o botão Chips. O painel financeiro detalha tarifas por provedor, operadora, APN e custo unitário, com quantidade e subtotal. Selecionar uma tarifa filtra os ICCIDs; a busca local aceita ICCID, série, placa, operadora e APN. A lista financeira tem paginação de 12 linhas e mostra aparelho, placa, situação e data da leitura.

APNs e vínculos vêm do cadastro SQL do aparelho. APN ausente não é inferida pelo provedor. ICCID com vários vínculos é contado uma vez e mostra todos os aparelhos/APNs. Valores do armazém usam os mesmos snapshots salvos, sem somar novamente esses itens à mensalidade da base. Valores ausentes não são zero.

Um cache por sessão/usuário e uma requisição em andamento compartilhada evitam leituras duplicadas ao navegar. Abrir e filtrar usam apenas GET de valores salvos; Atualizar Árya é uma ação explícita, mantém o limite existente e preserva a Link. Acompanhamento utiliza o fluxo existente, agora também dentro de Chips, A aba independente Chips reserva foi removida; os atalhos da visão geral abrem o acompanhamento em Chips.

Seleção de ativação somente para candidatos definidos em warehouse-activation-model.js e usuários com permissão. Limite de 10/20, seleção entre páginas, limpeza e indicador parcial no seletor da página. Preparados, solicitados, envios em conferência e respostas incertas permanecem desabilitados. O botão usa requestActivationLot, conservando a reserva no servidor e a proteção contra reenvio. Enquanto processa, bloqueia novos cliques; ao concluir ou falhar, limpa a seleção e orienta o acompanhamento. Não foi adicionada ativação automática ou alteração no backend.

Detalhes, classificação e remoção usam os fluxos existentes. As alterações confirmadas pelo servidor atualizam a lista a partir do recibo, sem nova leitura extensa. Movimentação de aparelhos permanece em Aparelhos.

Validação local com dados fictícios: 17 testes Node focados (chips, ativação, envio e resumo); teste de navegador test-warehouse-chips-inventory-ui.mjs (filtros sem consulta, preços em cache, limites, pendentes, clique duplo, cadastro, classificação, histórico, permissões, 1917×913, 1280×720 e 390×844); regressão test-warehouse-overview-ui.mjs. Transporte de ativação simulado e conexões externas bloqueadas no teste novo. Nenhum chip real ativado.

## Aparelhos

A antiga aba Inventário agora se chama Aparelhos e apresenta Gestão de aparelhos, com cartões locais de Estoque, Reserva, Emergência e Total. Os cartões filtram somente aparelhos disponíveis, reutilizando a classificação existente. Cadastro abre no tipo Aparelho; busca por série, detalhes, classificação, seleção, revisão e envio mantêm as permissões e confirmações existentes. A navegação interna duplicada foi ocultada. Nenhuma consulta externa foi adicionada.

## Movimentações

Padrão de gestão com indicadores de envios de aparelhos, destinos, registros filtrados e histórico total. Abre nos envios do mês atual (America/Fortaleza). Filtros locais por mês, destino/base ou destino manual, série/observação e escopo (envios, aparelhos, chips, todos). Histórico completo limpa os filtros e inclui registros sem data; detecções não contam como envio físico. Ordenação da lista por data decrescente, sem mutar os eventos originais; paginação reaproveita a lista filtrada. Não altera registros nem consulta provedores. Testes: warehouse-movements.test.mjs e test-warehouse-overview-ui.mjs.

## Análise mensal

Dashboard dedicado aos envios de aparelhos, com mês de referência, últimos 3/6/12 meses e destino (incluindo destinos livres). Mostra mês escolhido, mês anterior, variação percentual, total do período, barras por destino e tabela mensal. Mês em andamento é identificado como parcial; sem base anterior não inventa percentual. Usa apenas registros locais de envio, mantém reenvios legítimos, não soma detecção como envio e preserva registros de aparelhos removidos quando o evento guarda o tipo. Envios sem data permanecem no histórico e são sinalizados. O atalho Ver movimentações aplica mês e destino. Nenhuma escrita ou consulta a provedores. Testes: warehouse-monthly.test.mjs e regressão visual test-warehouse-overview-ui.mjs.

## Cards de indicadores compartilhados
O padrão aprovado dos Chips é aplicado aos indicadores de todas as páginas por public/indicator-cards.css, carregado após os estilos locais: degradê suave, ícone à esquerda, número destacado e descrição compacta. Mantém filtros, estados selecionados e dados existentes. Movimentações e Análise mensal usam o mesmo padrão. Validação: tools/test-indicator-cards-ui.mjs (navegação demonstrativa) e tools/test-warehouse-overview-ui.mjs (fluxos sintéticos do armazém).
