# Visão geral: atualização sem reapresentar os cards

Cards de estoque e barras de manutenção preservam seus elementos durante respostas parciais e atualização manual. Os últimos resultados permanecem visíveis durante a consulta; falhas são sinalizadas sem apagar o resultado anterior. A ordenação das barras acompanha os totais recebidos.

Na Visão geral, a animação é liberada por card pronto, sem aguardar todas as requisições da página. Identidades estáveis e um WeakSet impedem reapresentar elementos já exibidos. Outras telas mantêm a espera pelas consultas.

Validação: 172 testes existentes passaram. `JSDOM_MODULE=/caminho/jsdom/lib/api.js node web/tests/overview-dom.mjs` passou com consultas simuladas, respostas parciais, preservação dos elementos, animação única, totais, ordenação, atualização manual e falha parcial. JSDOM é somente ferramenta de teste, sem dependência de produção. Não foi possível validar visualmente em Chromium: o download do navegador retornou arquivo inválido neste ambiente. Nenhuma API operacional foi usada e nenhuma publicação foi realizada.
