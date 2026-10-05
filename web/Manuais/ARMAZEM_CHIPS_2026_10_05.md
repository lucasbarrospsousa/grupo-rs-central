# Chips Hinova e Link no armazém

No cadastro de chip, selecionar Hinova ou Link Solutions, informar o ICCID e
usar Buscar chip. O formulário mostra operadora e telefone devolvidos pelo
provedor. Alterar ICCID ou provedor invalida o resultado; consulta indisponível
ou sem operadora mantém o salvamento bloqueado.

Ao salvar, o servidor consulta novamente o provedor selecionado, exige ICCID
exato e operadora preenchida e grava somente os dados da resposta. Valores
de operadora enviados pelo navegador não são usados. A lista exibe operadora,
provedor e telefone abaixo do ICCID. Cadastros antigos continuam sem informação
até serem conferidos; nenhum provedor foi atribuído por suposição.

Migração 028 adiciona três colunas opcionais. Executar
`node web/tools/migrate-warehouse-chip.mjs` na raiz app: aceita apenas versões
27/28 e verifica escrita/releitura dos dois provedores em registros sintéticos
desfeitos por savepoint. Não altera estoques existentes.

Testes: `node --test web/tests/warehouse-chip.test.mjs web/tests/release.test.mjs`.
`web/tools/test-warehouse-chip-ui.mjs` testa o formulário real em navegador
isolado, com APIs simuladas. Usa Playwright disponível no ambiente (ou caminho
em PLAYWRIGHT_MODULE), sem sessões pessoais e sem cadastrar chips reais.
