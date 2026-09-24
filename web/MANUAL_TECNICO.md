# Estado atual — 24/09/2026

A versão web já possui SQL e integrações reais. Consulte [OPERACAO_WEB.md](OPERACAO_WEB.md) para a arquitetura hospedada, comandos verificados, testes e limites de homologação. As seções anteriores abaixo documentam a evolução da prévia e não substituem o estado atual.

# Grupo RS Central Web

> Atualização de 24/09/2026: a homologação SQL foi autorizada e implementada separadamente. Consulte `HOMOLOGACAO_SQL.md` para execução, limites e testes. O restante deste documento registra a etapa visual e continua descrevendo o modo padrão de demonstração.

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

## Configurações

- `settings-page.js`/`settings.css`: quatro cards de integrações e painel Ambiente da operação; alternância Conexões/Atualizações e detalhes das APIs.
- Layout conferido contra a composição de configurações em `inventory_dashboard.gd`. Conexões exibem Pendente e zero configuradas, não o estado real do desktop.
- Nenhuma leitura de cofre, coleta de credenciais, teste remoto ou instalação de atualização. Os botões explicam as integrações pendentes.
- Chrome: composição e alternância de seções conferidas; 26 testes de regressão passaram. As páginas adaptadas continuam uma prévia, não migração integral de banco e serviços.

## Estado atual: coleta no servidor e menu único

A descrição operacional vigente está em `OPERACAO_WEB.md`, seção Atualização automática. As notas anteriores de demonstração são histórico da migração. `backend/background-sync.mjs`, migrações 006/007 e `tools/schedule-sync.mjs` implementam a coleta persistente. `public/sidebar.js`/`sidebar.css` substituem os menus específicos de cada página. `public/stock-live.js` apresenta as observações sem sobrescrever os cadastros.

Validação desta entrega: 57 testes locais, validação API/portal publicada nas quatro bases, execução real do agendador com posições e chips confirmados. Não foram executadas escritas de teste nas plataformas operacionais.


## Correção de atendimentos e consumo de chips — 24/09/2026

A aba Manutenções mostra relatórios com cliente, placa e série, normaliza as situações do desktop e exclui da apresentação registros técnicos do Configurador. Esses registros permanecem no banco. O histórico importado mantém todos os campos originais, com aliases de apresentação; uma referência estável evita duplicar o relatório na tela.

O formulário de Imperatriz pesquisa clientes no portal e exige selecionar o veículo e aparelho retornados. Ao salvar, o servidor reconfirma cliente e vínculo, preserva o aparelho de chegada e salva relatório e eventual baixa em uma transação. O estado Concluída indica relatório registrado. Edição mantém identidade original e baixa existente; uma nova troca requer outro atendimento. Busca, situações, período, contadores filtrados e PDF utilizam os mesmos atendimentos visíveis.

`node web/tools/import-maintenance.mjs` faz conferência sem gravar; `--apply` adiciona somente identidades ausentes. Snapshot SQLite consistente, cópia dos registros de destino e resultado ficam em `.secrets/homologacao/`. Não atualiza nem exclui registros existentes. A migração 010 permite relatórios históricos sem cadastro atual do aparelho, preservando sua identidade no documento, e impede importar duas vezes a mesma visita.

A gravação do Configurador agora consome o ICCID exato no Armazém e registra movimentação Utilizado na mesma transação do aparelho. Repetição não cria nova movimentação. Item enviado, filial divergente ou chip associado a múltiplos aparelhos bloqueiam a gravação. Chips externos ao Armazém continuam permitidos. `reconcile-configurator-chip.mjs` permite conferir um caso explícito por filial, série e ICCID completo; `--apply` exige confirmação atual na plataforma e auditoria da gravação original, criando backup privado antes da correção.

Validações focadas: `node --test web/tests/maintenance*.test.mjs web/tests/configurator.test.mjs`; `node web/tools/test-maintenance-sql.mjs`; `node web/tools/test-configurator-warehouse-sql.mjs`. Os dois últimos usam dados sintéticos em transações revertidas, papel SQL de runtime e plataformas simuladas; nunca enviam SMS ou escrevem na plataforma. Conferência visual de formulário, filtros, edição e viewport móvel foi executada em Chrome isolado.


## Contatos do chip e apresentação de Manutenções — 24/09/2026

Cadastro e edição incluem ICCID como texto e telefone com DDD. O servidor valida os novos valores e normaliza a pontuação do telefone. O formulário conserva a versão original aberta para impedir sobrescrever uma atualização concorrente.

A migração 011 preenche contatos ausentes a partir de consulta confirmada pela série exata, tanto no ciclo automático quanto na consulta da página. ICCID deve começar com 89 e conter 19 ou 20 dígitos. Telefone inválido também pode ser corrigido quando a consulta confirma o mesmo chip. Valores válidos existentes não são sobrescritos automaticamente. A consulta pode complementar o portal pela API de equipamentos e o telefone pela operadora, sempre com identidade exata. Consulta recusada, antiga ou sem correspondência não preenche dados.

Após confirmar o ICCID, o chip Disponível no Armazém da mesma filial passa a Utilizado e recebe uma movimentação e auditoria, na mesma transação. Repetição não duplica movimento; outra filial, envio anterior ou associação múltipla ficam para conferência. Funções internas não são concedidas ao navegador nem às roles públicas. A função chamada pelo servidor exige usuário operador/admin da filial.

`node web/tools/reconcile-device-contacts.mjs` consulta sem alterar cadastros; `--apply` faz o preenchimento, após snapshot privado dos aparelhos e do Armazém. A conferência usa consultas reais; os resultados detalhados e backups permanecem em `.secrets/homologacao/`. A rotina não exclui registros nem modifica as plataformas externas.

Validações: `node web/tools/test-device-contacts-sql.mjs` e `node web/tools/test-device-contacts-api.mjs` usam transações sempre revertidas e dados sintéticos. Cobrem persistência, repetição, associação ambígua, permissão, versão concorrente e validação dos campos. Os testes de integração com operadoras são simulados em `web/tests/stock-live.test.mjs`.

Manutenções usa indicadores compactos, cards com identidade e aparelhos, busca combinada e paginação de dois atendimentos. Exportação continua abrangendo todos os resultados filtrados; o relatório mostra observações completas. Animações de entrada e hover respeitam a preferência de movimento reduzido. Conferência visual em 1917×991 e 390×844, navegação lateral, paginação, filtros, edição e formulário de atendimento executada com dados sintéticos em Chrome isolado.
