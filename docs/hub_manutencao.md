# HUB: veículos em manutenção por base

Um gráfico horizontal com quatro bases; apenas a categoria Manutencao das plataformas. Não usa nem altera relatórios de atendimento, vínculos ou estoque local.

Os acessos às bases permanecem acima. A consulta ocorre ao abrir o HUB e pelo botão Atualizar gráfico, sem timer/monitoramento. Cada base usa um nó de serviço, credenciais e cookies próprios; nenhuma leitura troca a filial selecionada. Consultas sequenciais limitadas a 12 segundos por requisição, sem repetição automática de login. Ao sair do HUB, seus nós e requisições são descartados.

## Fontes e limite atual

- Imperatriz: https://imp.ogrupors.com.br
- Araguaína: https://arg.ogrupors.com.br
- Marabá: exclusivamente https://mab.ogrupors.com.br
- Açailândia: https://acl.ogrupors.com.br, endereço informado pelo usuário e lista completa validada em 21/09/2026. O HUB não utiliza o host legado. Outras integrações existentes estão fora desta alteração.

Nas quatro plataformas, autentica via login.php e consulta somente GET get_veiculos_intervalo.php?intervalo=Manutencao. Este é um endpoint web autenticado, não uma API REST oficial. Redirecionamentos não são seguidos; cookies e senhas não são enviados a outro host. Reutiliza o cofre/configuração existente em memória, sem gravar credenciais ou resultados.

O parser exige título com total e tabela completa. Diferença entre total declarado e linhas recebidas, sessão expirada, timeout ou formato inesperado são pendências. Zero só é confirmado com total zero e tbody válido. Falha de atualização remove o valor anterior da comparação.

## Interação

Verde = menor quantidade confirmada; vermelho = maior; intermediárias amarelo/laranja com quatro valores distintos. Empates recebem a mesma cor. Com menos valores distintos, distribui a paleta entre os extremos; um único valor distinto é verde. Pendências são cinza e ficam fora da comparação.

Tooltip informa base, quantidade, origem e horário. Clique abre uma lista central com cliente, placa, equipamento, APN, telefone do chip e última comunicação. Busca por cliente/placa/série e filtro de APN operam sobre a lista consultada, sem novas requisições. Campos truncados têm tooltip. A lista é somente leitura.

## Validação

`tools/test_offline.ps1 -Tests @('tests/hub_maintenance_test.gd') -Rendered`

Verifica parser, total incompleto, login, zero, empates, indisponibilidade, abertura, busca e geometria em 1917x991. Capturas e registros são sintéticos e ficam no diretório temporário isolado.

`tools/test_offline.ps1 -Tests @('tests/main_scene_smoke_test.gd','tests/sidebar_branch_switch_test.gd')`

`tests/hub_maintenance_readonly_probe.gd` é uma consulta real explicitamente autorizada, não teste offline: usa o cofre existente e imprime somente base, sucesso, contagem e erro resumido. Não executar indiscriminadamente. Validado nas quatro bases, inclusive Açailândia no endereço novo indicado pelo usuário.
