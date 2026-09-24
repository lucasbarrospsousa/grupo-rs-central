# Grupo RS Central Web

Data: 24/09/2026. Etapa: preparação anterior à autorização do banco.
Raiz: subpasta `web/` do repositório Grupo RS Central (`app`). O desktop continua sendo o sistema operacional.

## Estado da entrega

Esta é uma aplicação web demonstrativa, não uma migração de dados nem uma implantação de produção.
Não cria tabelas, não conecta Supabase, não lê o SQLite operacional e não consulta APIs externas.
Os dados são fictícios e voláteis: recarregar a página restaura o cenário. Sair retorna à entrada, sem simular autenticação segura.
Não há persistência em localStorage, coleta de senha ou chave administrativa distribuída.

| Módulo | Implementado antes do banco | Pendente depois da autorização |
|---|---|---|
| Entrada | Seleção da filial e entrada explicitamente demonstrativa | Supabase Auth, sessão, autorização por filial |
| Visão geral | Quatro bases, cores por ordem de quantidade, gráfico clicável, indicadores | Leituras reais e estados parciais das APIs |
| Lista de manutenção da plataforma | Busca, APN recolhível, filtro 4G/2G, paginação, detalhes | Consulta oficial, atualização, telefone real e cópia |
| Estoque | Consulta por filial, filtros, análise/seleção/confirmação de baixa simulada | Reconsulta remota, progresso, transação e auditoria no servidor |
| Armazém | Cadastro de aparelho, seleção, destino base/livre, confirmação, remoção, histórico | Persistência, permissão, transações e integração com Configurador |
| Chips | Lista de exemplos, validação de formato, bloqueio sem Arya | Consulta Arya no servidor e prova de validação não falsificável |
| Relatório de manutenção | Motivo, meio, observações, seleção de reposição, baixa simulada | Identidade real, transação SQL, edição e PDF |
| Cadastro em massa | Pré-validação de séries, inválidas e duplicadas | Importação com confirmação e relatório de erros |
| Rastreamento | Busca de veículos fictícios e detalhes | Posições, mapa, registros e trajetos reais |
| Vinculação | Preparação da seleção e identificação | Escrita remota confirmada e reconciliação |
| SMS | Composição e prévia, envio bloqueado | Gateway, autenticação, fila, consentimento e confirmação |

Não chamar as linhas parcialmente preparadas de módulos migrados integralmente.

## Execução e arquitetura

Node.js 22 ou superior. Sem dependências npm nesta etapa.

```powershell
# A partir da raiz app:
node web/server.mjs
node --check web/public/app.js
node --test web/tests/*.test.mjs
```

Abrir `http://127.0.0.1:4173`. `PORT` pode escolher outra porta.
O servidor escuta somente loopback, oferece apenas `public/`, aceita GET/HEAD e bloqueia conexões de saída da página com CSP `connect-src 'none'`.
Não usar este servidor de prévia como servidor de produção.

- `public/app.js`: navegação, telas e eventos. Conteúdo editável interpolado passa por escape HTML.
- `public/styles.css`: identidade azul/branco/laranja, layout adaptável, SVGs e respeito a movimento reduzido.
- `public/domain.js`: regras puras, classificação por série, filtros e adaptador em memória.
- `public/logo.png`: cópia do ícone já versionado do aplicativo.
- `tests/domain.test.mjs`: regras e isolamento em cenários sintéticos.
- `tests/server.test.mjs`: rotas, assets, CSP e bloqueio de escrita/travessia; servidor temporário isolado.

O próximo adaptador deverá ser assíncrono e tratar concorrência no servidor. A validação em JavaScript desta demonstração não é uma fronteira de segurança.
Não colocar a chave service_role, senha SQL ou tokens das filiais em `public/`.
Não há EXE, instalador ou processo de publicação pública criado para a web.

## Validação em 24/09/2026

- Testes de domínio: quatro filiais, série com zero, falha versus ausência, vínculo ambíguo, 4G/2G, baixa repetida, versão alterada, filial incorreta, chips, envio e relatório.
- Chrome perfil Lucas, prévia local: entrada, painel, barra de Marabá, filtro 4G, recolhimento APN, baixa de três exemplos, cadastro de aparelho, bloqueio de chip sem Arya, envio para destino livre e histórico, relatório com reposição.
- Inspeção visual em 1568×1003; comportamento responsivo verificado separadamente. Os números são demonstrativos.
- Nenhuma validação real de banco, RLS, multiusuário, API, SMS ou persistência. Não substituir a Central atual.

## Próxima etapa

Ver `BANCO_PROPOSTO.md`. Somente após autorização explícita: preparar migrações SQL revisáveis, autenticação, RLS, conectar ambiente de teste e validar transações/concorrência. Importação de produção e substituição do aplicativo são etapas separadas.

## Estoque: adaptação da tela desktop

- `public/stock-page.js`, `stock-model.js` e `stock.css` isolam a página de Estoque.
- Busca simples e por séries exatas separadas por ponto e vírgula; resumo de não encontrados, filtros de situação e período, ordenação, seleção e paginação.
- Período segue a data de atualização/cadastro do desktop; instalação é independente.
- Cadastro, edição, remoção e relatório CSV funcionam somente sobre exemplos em memória. SMS, reconexão e localização informam integração pendente.
- Validado no Chrome: busca em lote, período inválido, paginação, cadastro e relatório; 19 testes automatizados passaram.
- Layout verificado no viewport real de 1536×674: sem transbordamento horizontal da página, cinco linhas completas na área da tabela (360 px), rolagem vertical da página e paginação abaixo. O painel não comprime a lista para caber na altura da janela.

## Vinculação: adaptação da tela desktop

- `public/link-page.js` e `link.css`: lista à esquerda, editor à direita, busca por série, filtros Reserva/Manutenção, seleção e revisão com titular RS300.
- Regras conferidas em `docs/vinculacao_estoque.md`, `src/ui/stock_link.gd` e serviço correspondente. Identificação AAA/GRS/XRS com 1 a 6 números; zeros preservados.
- Cenário isolado com 12 aparelhos fictícios, somente Imperatriz, sem alterar o adaptador de Estoque. Outras filiais exibem a indisponibilidade correspondente ao escopo original.
- Revisão funciona; confirmação permanece desabilitada até integração autorizada. Atualizar lista não consulta API real.
- Chrome: filtro Reserva, seleção e resumo revisados; layout com rolagem natural e sem transbordamento horizontal. Teste de identificação e regressão: 20 testes.

## Cadastro em massa: adaptação visual e análise local

- `bulk-page.js` e `bulk.css`: quatro cards de resumo, entrada e quadro de análise em duas colunas, layout com rolagem natural.
- Regras consultadas no desktop: `approved_bulk_view.gd` e funções de análise/organização de `inventory_dashboard.gd`. Série com nove dígitos, placa opcional, operadora padrão, repetições e conflitos, restauração do texto anterior, cópia e revisão.
- Importação local limitada a CSV/TSV/TXT até 2 MB; Excel pode ser colado ou exportado como CSV. Leitura direta XLSX/PDF, inferências avançadas do desktop, consulta de clientes, SMS e gravação remota ainda pendentes. Não interpretar como migração integral desses serviços.
- Análise não consulta duplicados no banco operacional. Confirmação bloqueada até integração autorizada.
- Chrome: três linhas resultaram em dois registros únicos e uma repetição; organização, desfazer e revisão conferidos. 22 testes passaram.

## Manutenções: página de atendimentos

- `maintenance-page.js` e `maintenance.css`: resumos coloridos, filtros combinados por nome/placa/séries, situação e data; cards por visita em duas colunas e relatório individual.
- Seis visitas sintéticas ilustram a tela sem copiar dados pessoais da referência. Novos relatórios usam o adaptador demonstrativo existente e aparecem na lista. Concluída significa relatório registrado, não comprovação de solução.
- Exportar PDF prepara o recorte filtrado e oferece impressão/salvar PDF do navegador. Não é o gerador PDF operacional do desktop.
- Regras consultadas em `docs/manutencoes_atendimentos.md`; formulário e baixa demonstrativa existentes preservados. Banco/API real não conectados.
- Chrome: composição visual, filtro de placa e relatório individual conferidos. 23 testes automatizados passaram, incluindo filtros e regras existentes de relatório/baixa.

## Rastreamento — Consultar veículo

- `consult-page.js` e `consult.css`: menu Rastreamento recolhível com três subitens, consulta explícita, seletor de cliente, cards e tabela paginada; rolagem natural da página.
- Regras conferidas em `src/ui/equipment_consultation.gd`: busca acionada por botão/Enter, filtros locais e nenhuma escrita automática. Séries numéricas usam correspondência exata.
- Dados vêm somente do adaptador demonstrativo. Vínculos, comunicação e ausência no banco real não são presumidos; ficam não consultados. Consulta de clientes usa nomes sintéticos da sessão.
- SMS, edição remota, Histórico de posições e Trajeto mostram pendência de integração; não simulam envio, posição ou gravação. Edição demonstrativa continua disponível na página Estoque.
- Chrome: digitar manteve 14 resultados; Buscar pela série retornou um; menu expandiu/recolheu. 24 testes passaram.

## Histórico de posições

- Tela `records-page.js`/`records.css` baseada em `src/ui/tracking_records.gd`: período, Hoje/Ontem/Personalizado/Limpar, validação de até sete dias, métricas, histórico vazio e detalhes.
- Navegação pelo submenu Rastreamento. Sem API não há busca real, posições, mapa ou PDF; botão Buscar explica a pendência, sem classificar como ausência de registros.
- Atalhos usam a data local do navegador nesta prévia. O fuso da plataforma será aplicado pelo adaptador autorizado.
- Chrome: composição e navegação conferidas. Testes de datas e regressão: 25 testes.

## Trajeto

- `route-page.js`/`route.css`: filtros e atalhos, métricas, área de mapa, legenda, reprodução e linha do tempo conforme referência. Reaproveita validação de sete dias do Histórico.
- Fonte consultada: `src/ui/tracking_route.gd`. Sem API/posições, mapa, reprodução e KML ficam desabilitados. Não desenha percurso fictício nem atribui ausência de dados a ausência de posições reais.
- Chrome: navegação e composição conferidas; 25 testes de regressão passaram. Integração real, mapa, reprodução e exportação ainda pendentes.

## Armazém: adaptação visual

- `warehouse-page.js` e `warehouse.css` adaptam a tela existente: três cards, abas Aparelhos/Chips/Movimentações, filtros, paginação de 12 itens, seleção e limpeza, remoção com confirmação e painel de envio.
- Regras conferidas em `src/ui/scanner_inventory.gd`. Preservados cadastro manual, zeros, confirmação de envio, histórico e bloqueio de chip sem Arya.
- Somente adaptador em memória; não confere chips utilizados no banco real. Indicador de envios refere-se à sessão demonstrativa.
- Chrome: aparelho selecionado, envio confirmado na simulação e encontrado em Movimentações; cadastro de chip bloqueado; abas e layout conferidos. Testes de regressão: 25 passaram.

## Painel SMS

- `sms-page.js`/`sms.css`: acompanhamento com quatro indicadores, aviso explícito de demonstração, tabela selecionável e detalhes do pedido; referência `src/ui/sms_delivery_panel.gd`.
- Exemplos sintéticos, sem telefones reais, gateway, consulta automática ou envio. Atualizar apenas informa ausência de integração. A composição anterior de mensagem deixa de ser a página principal de acompanhamento.
- Contador enviados inclui entregues; entrega não comprova execução do comando. Falha Wi-Fi não altera estado dos exemplos nem aciona reenvio.
- Chrome: layout e seleção de pedido conferidos. Contadores testados; 26 testes passaram.
