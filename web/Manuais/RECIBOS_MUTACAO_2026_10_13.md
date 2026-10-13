# Atualização por resposta confirmada — 13/10/2026

Salvar/editar/excluir aparelhos e chips, classificar e transferir itens,
cadastro em massa e criar/editar manutenção não recarregam listas inteiras.
O backend inclui `changes` com o estado final dos registros afetados, limitado
por IDs e filial. A resposta só é enviada após COMMIT; erro HTTP ou `ok:false`
não é sucesso. Idempotência, versões, RLS e auditoria permanecem.

A captura dos registros afetados ocorre dentro da transação, incluindo os
efeitos dos gatilhos sobre chips/aparelhos do armazém. Não é a consulta completa
do estoque usada anteriormente. Recibos antigos sem `changes` são enriquecidos
na repetição sem repetir a mutação. Respostas confirmadas de versões anteriores
sem recibo indicam atualização pendente, sem reenviar a gravação.

O cliente aplica apenas versões iguais ou superiores, preserva a filial visível,
deduplica movimentos, ignora respostas após logout e impede listas em trânsito
de sobrescrever alterações confirmadas. Excluir mantém tombstone de versão em
memória para evitar ressuscitar linhas por resposta atrasada. A atualização
manual continua disponível e novas navegações consultam grupos ainda não carregados.

Baixa, vínculo e troca mantêm a confirmação externa existente. Após confirmação,
recebem somente os registros locais afetados. Falha ao preparar esse recibo não
transforma uma operação externa confirmada em pedido de reenvio. Ativação de chips
exibe seu estado real (inclusive pendente/incerto), sem presumir ativação pelo HTTP.

## Validação

- Testes de cliente: nove operações sem GET posterior, versões fora de ordem,
  exclusão, filial, logout, falha HTTP e resposta 200 com erro de aplicação.
- SQL real sob papel de execução, dados fictícios e rollback: chips/aparelhos
  em criar/alterar/excluir; transferência, lote de dois aparelhos e manutenção
  em criar/editar. Verificados recibos com registros finais, versões e movimentos.
  Identidades temporárias removidas; nenhum cadastro/ativação em operadora.
- Mesma metodologia da análise anterior: HTTP local e banco remoto; savepoints
  substituem commit durável nos testes. Não é medição do navegador/site hospedado.
- Salvar chip: antes aproximadamente 3,96 s incluindo recarga; agora 2,4–2,6 s.
  Salvar aparelho: antes 4,54 s; agora 2,86–2,94 s. Excluir chip: 2,24–2,26 s;
  excluir aparelho: 2,39–2,40 s. Não há os 1,63–1,96 s de recarga subsequente.
- Bateria geral: 341/347 passaram. As seis falhas de texto/estado de GPS e
  comunicação foram reproduzidas no commit anterior, sem estas alterações.
  Não foram alteradas nesta entrega de desempenho.

Reprodução: `node --test web/tests/mutation-receipt.test.mjs`;
`node web/tools/profile-crud.mjs --rollback-only --receipts-only`.
`--extended-only` executa apenas cenários adicionais de lote/transferência/manutenção.
