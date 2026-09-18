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

## Cadastro, reentrada e relatório

Revisados `_build_form_view`, `_request_save_as_stock_form` e
`_build_inventory_report_builder` no código atual antes de criar as telas.
Novo equipamento e Editar abrem formulários completos de demonstração,
com identificação, APN, chip, telefone, operadora, placa, tipo local e status.
Reentrada mantém identidade do registro selecionado. Resumo atualiza durante
a edição; salvar/consultar não acessam integrações nem persistem dados.
Relatório herda busca, status, filial e período, permite selecionar suas quatro
seções, formato PDF/XLSX e zoom entre 80% e 120%. Geração é simulada.
Validação adicional: `node tools/design-preview/validate-forms.cjs`.
