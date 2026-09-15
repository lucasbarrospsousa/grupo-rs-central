# Aplicação visual 4.3.0 — layout aprovado

Referência aprovada: tools/design-preview. A aplicação nativa preserva a
estrutura operacional: métricas adicionais, regras de filial, consultas,
campos e callbacks existentes não foram substituídos pela lógica fictícia.

Componentes novos: ui/approved_visuals.gd aplica superfícies claras, bordas,
sombras discretas e limita dimensões dos ícones. ui/metric_backdrop.gd desenha
gradientes e anéis decorativos sem interceptar entrada. Paleta compartilhada
azul/laranja, menu lateral ampliado e resumo claro de cadastro/reentrada.
Painel SMS recebe cartões coloridos e ícones vetoriais, mantendo acompanhamento,
histórico e recuperação. A animação existente é preservada sem tweens duplicados;
GRUPO_RS_REDUCED_MOTION=1 desativa entrada de conteúdo.

Testes em dados sintéticos: cena, navegação/saída, quatro filiais com busca e
paginação/persistência, calendário, proteção do banco e fluxos preservados de
cadastro em lote e exportação PDF/XLSX. approved_design_visual_test.gd constrói
e captura dashboard, estoque, novo, reentrada, SMS e relatório. Construir uma
tela não equivale a testar serviços externos: não houve gravação operacional,
SMS real nem validação de disponibilidade de APIs nesta entrega.

## Substituição dos construtores legados

- `_build_dashboard_view` monta `ui/approved_dashboard.gd`, com quatro cartões,
  distribuição por operadora, perfil da base e atalhos operacionais. Reserva e
  inativos continuam acessíveis pelos atalhos, com os filtros originais.
- Os construtores sem referências `_build_legacy_dashboard_view` e
  `_build_legacy_form_view` foram retirados após busca de referências. O formulário
  ativo conserva campos, validações, consulta de IMEI/chip e callbacks de gravação.
- Estoque foi recomposto em um cartão único; ações movidas ao cabeçalho, filtros
  e período em linhas separadas. Não houve alteração do armazenamento.
- `ui/approved_report_document.gd` substitui o documento visual antigo. Seções e
  formato agora atualizam o preview. A listagem visual limita 20 registros e
  informa essa limitação; exportação mantém o recorte completo.
- A animação de entrada não sobrescreve mais a posição calculada pelo container.
  Uma única tela fica montada no host a cada navegação.
- `ui/approved_equipment_summary.gd` apresenta resumo em linhas alinhadas e
  reaproveita os callbacks existentes, incluindo salvar somente no estoque.
  Os diagnósticos de vínculo remoto e registro local continuam visíveis quando
  presentes. A edição dos rascunhos é verificada sem gravar dados.
- Referências panorâmicas enviadas pelo usuário foram feitas com zoom reduzido
  apenas para mostrar a composição. Não reproduzir a escala reduzida das letras;
  usar o HTML em 100% como referência de tamanho.
- Ícones novos em `assets/icons/approved` são SVGs de traço uniforme, sem bitmaps
  nem dependência de serviços externos.

## Evidência e limite da validação

O teste visual também verifica navegação pelo cartão de estoque, remoção da tela
anterior, campos de tipo/status, resumo dos rascunhos, opções do relatório,
formato e zoom, ausência de gravação dos rascunhos e respeito às margens.
`tools/design-preview/capture-reference.cjs` captura as oito telas HTML em
1920×1080, sem requisições externas e após concluir as animações finitas.
Os testes focados de SMS passaram em paginação, filtros, recuperação com API
simulada e suspensão da recuperação fora do painel. O seletor de calendário
também passou no fluxo abrir → selecionar → aplicar ao período.

Meta solicitada: pelo menos 92% de fidelidade ao HTML. **Essa meta ainda não foi
comprovada**. Não usar os testes funcionais como medida de semelhança visual.
Cadastro em massa e Configurações receberam cards, margens e hierarquia do tema.
As oito telas foram renderizadas em 1920×1080 e comparadas às referências HTML.
Cadastro preserva importação, análise, limpeza, desfazer, prévia e confirmação;
Configurações preserva conexões, atualizações e proteção por cofre. Um label
oculto do cadastro passou a pertencer à árvore, eliminando vazamento ao sair.
O usuário aprovou a composição revisada do cadastro em massa e autorizou a
entrega. O módulo approved_bulk_view.gd apresenta quatro indicadores e um quadro
de revisão, reutilizando a análise e a confirmação existentes. Esta aprovação
visual não representa uma medição de 92%; telas menores ainda não têm validação
visual equivalente à resolução de referência.
Regressão final: approved_design_visual_test, retained_workflows_test,
feature_retirement_test, sms_panel_layout_test, sms_recovery_test e
inventory_calendar_selector_test passaram com isolamento e dados fictícios.
Entrega: exportação a partir de árvore Git limpa, auditoria do pacote, cópia
recuperável do executável anterior e substituição somente do EXE principal.
Credenciais, runtime, bancos e configurações externas não são substituídos.
