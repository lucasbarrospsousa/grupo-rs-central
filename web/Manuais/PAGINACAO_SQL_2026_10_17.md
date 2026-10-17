# Estoque e pesquisa: paginação SQL

As rotas de aparelhos `scope=page` e `scope=lookup` agora filtram, ordenam e paginam no PostgreSQL. A aplicação recebe uma página com dez aparelhos, metadados e contagens, sem transferir a projeção de toda a filial para filtrar em JavaScript. Exportação explícita continua abrangendo todos os resultados.

Mantidos: busca em toda a filial autorizada; séries em lote com faltantes antes dos filtros; acentos na pesquisa do estoque; titular somente com vínculo confirmado; prioridade das datas; Reserva regional como Estoque; seleção de cliente; pesquisa parcial da manutenção; ordenação natural e páginas fora do intervalo. Contagens são da filial inteira, não da página.

`device-sql-page.mjs` executa a consulta parametrizada na transação autenticada existente, com RLS e exclusão de registros removidos. Observações são lidas para os aparelhos selecionados; ordenar por conectividade requer considerar observações de toda a filial. Contagens e ordenação ainda examinam os registros necessários dentro do banco: não se promete eliminar todas as leituras internas.

Não houve alteração de layout, políticas de acesso, índices, tabelas, rotinas externas ou funcionamento do cache. PostgreSQL 17 e a collation existente `pt-x-icu` foram verificados. O SQL usa normalização NFD e validação de datas antes de conversão.

## Validação

- Testes diferenciais contra as funções anteriores, com dados sintéticos em CTEs de leitura: filtros, datas, ordenações, lotes, pesquisas, seleção de cliente, exportação, Reserva regional e filial vazia.
- Leituras reais limitadas às quatro filiais, conferindo totais e busca de série fora da primeira página; transação READ ONLY e ROLLBACK, sem provedores externos.
- RLS sem associação à filial: nenhum registro ou contagem retornados.
- EXPLAIN ANALYZE da página padrão confirmou dez acessos às observações. Testes diretos não enviam marcador `since` nem usam cache da aplicação; buffers internos normais do PostgreSQL permanecem ativos.

Teste diferencial SQL opcional, a partir de `app`, com credenciais locais já configuradas:

```powershell
$env:CENTRAL_SQL_READ_TEST='1'
node --test web/tests/device-sql-page.test.mjs
Remove-Item Env:CENTRAL_SQL_READ_TEST
```

Sem essa variável, o teste conectado é ignorado. Dados sintéticos não são gravados: são definidos em CTEs dentro de transação de leitura. As credenciais e dados reais nunca integram testes, documentação ou publicação.
