# Busca massiva de séries — 17/09/2026

No campo de busca do Estoque, use `024553699;024558974;024563387`.
O botão **Colar séries** substitui o campo pela lista do clipboard e converte
quebras de linha em ponto e vírgula. Ctrl+V com múltiplas linhas faz o mesmo.
Não usar conversão numérica: zeros à esquerda fazem parte da série.

Modo lista é ativado por ponto e vírgula ou quebra de linha; tokens vazios são
ignorados, espaços nas extremidades removidos e repetições deduplicadas.
Cada token corresponde exatamente ao IMEI/série ou SKU cadastrado, sem busca
parcial. Tokens sem correspondência aparecem como não encontrados. Uma busca
sem separadores continua usando a busca individual existente (placa, telefone,
chip, operadora etc.).

A origem é exclusivamente o cadastro local da base selecionada, não uma consulta
ao portal/API. A lista passa pelos filtros atuais de status e período. O resumo
conta séries únicas encontradas na base e exibidas; distingue ausências de itens
ocultos pelos filtros. **Buscar em todos os status** altera apenas o status,
preservando período, base e conteúdo da pesquisa. Não dispara SMS, não seleciona
ações, não altera registros nem faz reconciliação do estoque.

## Validação

Executor `tools/test_offline.ps1`, perfil/cofre/SQLite temporários isolados:

- `inventory_batch_search_test.gd`: quatro bases, busca exata, zeros, série mais
  longa, duplicatas, ausentes, status, período, botão de todos os status,
  busca individual, limpeza e igualdade dos registros antes/depois.
- Execução renderizada em 1917×1000, inspeção de `batch-search.png`, Ctrl+V
  multilinhar por evento de teclado; clipboard anterior restaurado no teste.
- `feature_retirement_test.gd`: quatro bases, busca individual, paginação,
  persistência e ausência de lookup remoto da pesquisa.
- Checagem estrutural rápida e `git diff --check`.

Testes passaram. Capturas ficam somente na pasta temporária indicada pelo
executor. Executável operacional ainda não substituído: pedir
**“posso atualizar agora?”**, aguardar autorização e gerar pacote a partir de
seleção limpa/versionada. Não incluir os probes, dados e rascunhos não versionados.
