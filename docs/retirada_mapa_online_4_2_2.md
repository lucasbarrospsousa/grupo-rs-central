# Versão 4.2.2 — retirada do mapa e da consulta online da busca

## Escopo

- Cena principal passa a carregar `src/inventory_dashboard.gd` diretamente.
- Retirados Mapa Grande, controlador de rastreamento, canvas, painel de ERBs,
  rotas antigas, atalhos no painel e ações da Luna que abriam o mapa.
- Retirados polling de localização da tela, varredura do antigo Monitor 4G,
  filas, estado visual e registro dos módulos aposentados.
- Retirado o painel Grupo RS online do estoque, seu HTTPRequest, callbacks,
  fila de enriquecimento e reconciliação automática originada por essa busca.
- Pesquisar, limpar e paginar continuam filtrando os cadastros locais.

Não foi desativada toda a integração Grupo RS. Sincronização de placas,
cadastros/baixas explícitos, comunicação do painel, conectividade de chips,
SMS e localização individual continuam separados e preservados.
Os auxiliares geográficos usados pelo cartão individual foram transferidos
para `src/features/location`. Cobertura Anatel é uma estimativa local, não
uma leitura atual de intensidade do sinal do aparelho.

## Segurança dos dados

Antes da mudança foi criada uma cópia SQLite consistente com todas as filiais,
tabelas, históricos e movimentos. A cópia foi conferida contra a transação
de origem, com `integrity_check`, `foreign_key_check` e SHA-256. Também foi
preservado o código anterior. As cópias e o manifesto ficam na área protegida,
fora do repositório. Nenhum registro operacional foi excluído nesta retirada.

## Alterações anteriores revisadas e autorizadas junto com a entrega

Incluem calendário/filtros de período, exportação PDF/XLSX do estoque,
normalização das operadoras no painel, recarga após revisão externa do banco,
proteção do SQLite para scripts de teste e retirada anterior da troca de
aparelhos. Recursos visuais necessários acompanham o código; dados e scripts
operacionais não são parte da entrega.

## Validação

`tools/test_offline.ps1` isola APPDATA, perfil de atualização e cofre temporário.
Somente testes previamente revisados devem ser passados para esse executor.
Não execute probes de produção nem a pasta de testes inteira indiscriminadamente.

Testes selecionados:

- `main_scene_smoke_test.gd`: cena principal e controlador correto.
- `main_scene_stock_exit_smoke_test.gd`: navegação e confirmação de saída.
- `feature_retirement_test.gd`: quatro filiais, busca por série/placa,
  consulta inexistente, limpeza, paginação, persistência, ausência de lookup
  e temporizadores do mapa. Conectividade externa é substituída por fixture.
- `local_sqlite_real_data_test.gd` e `local_sqlite_restart_test.gd`: cadastro,
  baixa, exclusão, auditoria, backup e releitura em banco sintético isolado.
- `operational_db_guard_test.gd`: bloqueio do caminho operacional em scripts.
- `external_database_change_monitor_test.gd`: revisão externa e recarga.
- `inventory_calendar_selector_test.gd`: abertura e seleção do calendário.
- `retained_workflows_test.gd`: parser em lote, duplicados, operadoras, PDF/XLSX.

Testes de código/módulos exclusivos do mapa foram aposentados junto com os
módulos. Arquivos não versionados de investigações anteriores permanecem no
computador, mas não devem ser publicados ou incluídos no executável.

## Exportação

### Resultado da validação da entrega

Os testes offline selecionados passaram, incluindo capturas renderizadas das
quatro filiais e inspeção do pacote exportado (versão, recursos necessários e
ausência de bancos, cofres e scripts operacionais). Nenhuma operação de estoque
real ou gravação em plataforma externa foi executada pelos testes.

A inicialização nativa confirmou o marcador de boot. O encerramento automático
headless (`--max-fps 60 --quit-after 600`) apresentou avisos de recursos não
liberados: 7 texturas dummy, 2 fontes, 1 CanvasItem, 36 instâncias e 1 recurso.
A comparação com o executável anterior 4.2.1 reproduziu os mesmos diagnósticos.
Portanto, o teste estrito de encerramento não passou; essa pendência preexistente
não foi tratada como regressão da retirada nem como validação sem avisos.

Gerar a distribuição a partir de uma seleção limpa, revisada e versionada.
O filtro de scripts Python inclui somente serviço SQLite e gerador de
relatórios. O executável principal mantém nome e destino existentes; conservar
sua cópia anterior antes da substituição e conferir versão e SHA-256.
