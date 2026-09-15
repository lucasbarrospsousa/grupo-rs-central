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
