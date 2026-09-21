# Analisar baixa — Estoque

Disponível no Estoque da filial selecionada para Imperatriz, Araguaína, Açailândia e Marabá. Analisa todos os registros cujo status exibido pela filial é Estoque, independente da busca atual. Nas regionais, Reserva já é apresentado como Estoque pelo sistema e integra esse recorte.

Consulta autenticada independente por filial: imp/arg/acl/mab.ogrupors.com.br, API /api_rest_app/endpoints/veiculos.php por série exata. Credenciais existentes, tokens e cookies somente em memória; não troca o roteamento global nem ativa outras integrações nas regionais. Não usa host legado como fallback. A API atual não fornece titular nessa listagem: o cliente é complementado pelo portal da mesma filial, cruzando série e placa exatas.

A análise é somente leitura. Só um vínculo exato, com placa de veículo e cliente confirmado, habilita seleção. O cliente é consultado antes de classificar identificações de estoque. Vínculo RS300 com identificação de estoque aparece como Permanece em estoque (azul), sem habilitar baixa. Vínculo apto é verde, inconsistências/ausências ficam em Conferir vínculo (laranja), e falhas de acesso/transporte aparecem como Falha na consulta (vermelho). Cada categoria tem contador e filtro próprios. Números preservam os zeros iniciais. Os motivos completos aparecem ao passar o mouse sobre o resultado. O operador pode cancelar a análise; a chamada atual termina antes de fechar a janela.

Aplicar baixa pede confirmação do total selecionado e reconfirma cada vínculo. Alterações no cadastro, na filial ou no vínculo bloqueiam aquele item. Atualiza somente a Central: status Instalado, placa do veículo e quantidade disponível zero, com movimento de baixa local e verificação do Banco local SQL. Não exclui/desvincula nem grava na plataforma remota. Sucessos e pendências são informados separadamente, sem repetir baixa de item já aplicado. Falha de confirmação SQL após a gravação local é mostrada como pendente; não equivale a desfazer a baixa local.

Layout: cabeçalho em degradê, cards azul/verde/vermelho e rótulos em negrito, busca por série/placa/cliente, filtro de resultado, seleção dos aptos do filtro e paginação de cinco linhas. A seleção persiste entre páginas/filtros; o total selecionado inclui essas linhas.

## Validação

- `tools/test_offline.ps1 -Tests @('tests/stock_discharge_test.gd') -Rendered`: quatro bases simuladas, ausência/ambiguidade, identificação interna, cliente não confirmado, cadastro/vínculo/base alterados, seleção explícita, sucesso e pendência SQL, filtros e captura em 1917×991.
- Regressões: hub_maintenance_test, main_scene_smoke_test, reserve_stock_api_test; contrato de pacote inclui a nova tela/serviço.
- `tests/stock_discharge_readonly_probe.gd`: executar somente em consulta real autorizada. Lê credenciais existentes sem migrá-las, consulta API/portal e imprime apenas nomes das bases, estados e presença de campos. Em 21/09/2026, autenticação/leitura e uma amostra de vínculo exato com cliente foram confirmadas nas quatro bases. Nenhuma baixa real foi aplicada. Isso não equivale à auditoria de todo o estoque.
