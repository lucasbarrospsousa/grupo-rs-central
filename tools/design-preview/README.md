# Prévia visual — Grupo RS Central

Proposta independente inspirada no Sistema das 24 Horas. Preserva navegação
lateral e agrupamento Equipamentos > Estoque / Cadastro em massa. Não altera
o executável, banco ou integrações. Todos os registros são fictícios.

Abra `index.html` no navegador. A logo usa o recurso original do projeto.
Início, estoque, cadastro, SMS e configurações são navegáveis. Busca, filtros,
troca de filial, detalhes e formulários simulam interações sem persistência.
Disponibilidade de SMS é ilustrativa; regras reais de filial não são alteradas.
Relatório abre seleção de formato, sem gerar documentos reais.

Animações curtas de entrada, hover e gráficos respeitam reduced-motion.
A opção de reduzir movimento é apenas um controle para avaliar esta prévia.

Validação: `node tools/design-preview/validate.cjs` com Playwright instalado e
Microsoft Edge disponível. Capturas ficam em tmp/design-preview-validation.
Nenhuma chamada externa é permitida pelo teste.

Não integrar ao aplicativo antes da aprovação visual do usuário.

## Revisão 02 — fidelidade aos fluxos atuais

Referências consultadas: `src/features/sms/sms_panel_view.gd` (painel ativo,
histórico e retorno após SMS), e `src/inventory_dashboard.gd` nas funções
`_build_list_view`, `_build_table_header`, `_make_table_row` e
`_build_status_quick_filters`.

O SMS agora representa acompanhamento, não composição livre. Mostra saldo,
solicitações, aceitos, custo, status, origem, retorno e histórico com filtros.
Estoque distingue Imperatriz das regionais: período, estados, paginação,
campos de placa, conectividade e ações condicionais. Comandos são abertos
pela linha do aparelho. Ações de gravação e exportação continuam simuladas
em janelas informativas; não reproduzem toda a lógica de negócio.

O gráfico inicial mostra operadoras e o menu usa SVGs uniformes.
Teste desta revisão: `node tools/design-preview/validate-refinements.cjs`.
O validador original documenta a proposta 01, não o contrato atual de SMS.
