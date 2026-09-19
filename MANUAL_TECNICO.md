# Grupo RS Central — manual técnico
Empresa: Sinderacode. Identificador: `central`.
Função: Aplicativo operacional do Grupo RS Central, incluindo estoque e integrações.
Raiz: `C:/Users/lugan/OneDrive/Documentos/Sidera Code/Grupo RS Central/app`.
Esta pasta é a fonte deste projeto; não usar o diretório de outro aplicativo por padrão.

## Comandos PowerShell
```powershell
& 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Scripts/projeto.ps1' -Projeto central -Acao Info
& 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Scripts/projeto.ps1' -Projeto central -Acao Rapido
& 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Scripts/projeto.ps1' -Projeto central -Acao Exportar
```
- Info identifica o projeto e mostra este manual.
- Rapido só verifica estrutura, cena principal, documentos, Godot e preset. Não inicia o aplicativo nem valida lógica.
- Exportar usa Godot 4.7.1 e Windows Desktop, gerando EXE em uma nova subpasta build/validacao-*; não substitui executável operacional nem publica.
- Para executar em desenvolvimento, abrir esta pasta no Godot e executar a cena principal definida em project.godot. Nos aplicativos operacionais, isso pode acessar serviços reais: só executar quando estiver no escopo.
- Instalador: não foi identificado/validado um fluxo comum de instalador. EXE exportado não equivale a instalador. Inspecionar scripts específicos antes de distribuir.

## Testes proporcionais

### Localização individual — painel aprovado em 19/09/2026

Janela nativa no padrão do SMS: cabeçalho azul, cliente/placa acima do mapa e última comunicação, ignição e tensão da bateria na lateral. O titular de posições da API é confirmado pelo vínculo exato no portal em segundo plano, inclusive quando o contexto local já contém um nome, sem bloquear o mapa; falha de consulta é diferenciada de nome não retornado. Mapa OpenStreetMap com arraste, zoom, centralização e marcador PNG. Sem indicadores ou cálculo de sinal/cobertura nesta abertura. Atualização manual preserva a posição anterior em falha; sem monitoramento automático. Campos ausentes aparecem como não informados. Detalhes e validação: `docs/localizacao_painel_2026_09_19.md`.

### API de Imperatriz — 19/09/2026

A API principal usa `https://imp.ogrupors.com.br/api_rest_app`, inclusive quando a configuração ainda contém uma URL antiga conhecida. A compatibilidade é aplicada em memória, sem regravar credenciais/configurações. Fluxos web, paginação, outras filiais e restrições operacionais permanecem separados. Leia `docs/IMPERATRIZ_API_2026_09_19.md` antes de atualizar a instalação.

### Retorno de manutencao ao estoque (18/09/2026)

Botao Estoque nas linhas em Manutencao e Reserva, com confirmacao. Reutiliza consulta oficial por serie exata; atualiza identificacao e status local, limpa o vinculo de veiculo atual e registra a placa anterior no historico. Nao modifica a plataforma remota. Falha, resposta ambigua ou troca de filial/cadastro durante a consulta preservam o registro. Exige API disponivel na filial. Versao exata conhecida e preservada; modelo ausente depende de identificacao reconhecida. Sucesso somente apos confirmacao do banco local. Teste sintetico: tests/reserve_stock_api_test.gd (inclui manutencao com/sem acento, falha, sucesso e botao renderizado).

### Classificacao por identificacao (18/09/2026)

Regra centralizada em `src/tracker_versions.gd`: GRS = V7.3.2; AAA = V7.2.2/7.1.6; XRS = V7.3.5. NOV continua reconhecido como identificacao interna legada para nao virar vinculo de veiculo, mas nao infere versao e Novo nao aparece nas novas opcoes. AAA nao determina qual das duas versoes fisicas esta instalada.

Formulario e importacao usam a nova regra. Nao escolher versao padrao sem informacao; placas comuns nao significam versao reutilizada. Status de reentrada preservado independentemente da classificacao. Normalizacao em memoria traduz RS Novo/Reutilizado e preserva versoes exatas existentes. Em itens instalados, a placa do veiculo sozinha nao infere versao. Sem migracao em massa de banco ou alteracao de plataformas; o proximo salvamento explicito continua usando o fluxo normal.

Teste isolado `tests/tracker_versions_test.gd`, alem de `tests/main_scene_smoke_test.gd`, pelo executor offline; captura renderizada do seletor. Nenhum banco operacional ou API alterado. Configurador tem commit e validacao separados.

Trajeto: `docs/trajeto.md`. Aba de consulta somente leitura em Imperatriz, mapa
nativo, reprodução ponto a ponto e exportação KML. Teste isolado
`tests/tracking_route_test.gd`, com `-Rendered` para validação visual.

Registros de rastreamento: `docs/registros.md`. Histórico somente leitura em Imperatriz; testes `tracking_records_service_test.gd` e `tracking_records_test.gd` pelo executor isolado. Mapa e PDF sob demanda; não persistir dados operacionais no Git/backup.

Nova aba Consultar: `docs/consulta_equipamentos.md`. Consulta por nome cruza vínculos remotos com registros locais, sem alterações automáticas. Teste isolado: `tests/equipment_consultation_test.gd` (suporta `-Rendered`).

Busca por várias séries: `docs/busca_massiva_2026_09_17.md`.
Teste isolado `tests/inventory_batch_search_test.gd`; aceita `-Rendered` no executor offline.

### Versão 4.2.2

Mapa Grande e o painel Grupo RS online foram retirados. A consulta individual,
estoque e operações explícitas permanecem. Escopo, isolamento, seleção de testes
e cuidados com exportação: `docs/retirada_mapa_online_4_2_2.md`.

Exemplo de teste offline revisado:

```powershell
& ./tools/test_offline.ps1 -Tests @('tests/main_scene_smoke_test.gd','tests/feature_retirement_test.gd')
```

Use `-Rendered` para capturas sintéticas das quatro filiais. Os arquivos ficam
no diretório temporário informado pelo executor, fora dos dados operacionais.

## Revisão com GitHub Desktop

Configuração vigente em 19/09/2026: `https://github.com/lucasbarrospsousa/grupo-rs-central.git`, branch local `main` acompanhando `origin/main`. A antiga branch local `master` foi renomeada sem alterar o histórico ou os arquivos operacionais.

O comando compartilhado também aceita `-Acao GitStatus` (consulta) e `-Acao Desktop` (abre a raiz Git correta). Utilizar o mesmo identificador deste manual. Se não existir repositório, o comando interrompe sem criar nem publicar. Política e pendências: `C:/Users/lugan/OneDrive/Documentos/Sidera Code/GITHUB_DESKTOP.md`.

### Seleção dos testes
Primeiro Rapido; depois testes da área alterada, previamente inspecionados e isolados. Não executar todos os arquivos de tests automaticamente.
Godot permite executar scripts com `--headless --path "<raiz>" --script "<teste.gd>"`, mas o teste deve ser compatível com headless e não gravar em sistemas reais.
Mudanças visuais requerem execução renderizada. Antes de entrega, testar regressões afetadas e a exportação quando aplicável.
Nenhuma suíte funcional foi aprovada como offline nesta padronização; selecionar e revisar antes de executar.

## Limites

Integração Android opcional de SMS: consultar `docs/SMS_GATEWAY.md` para pareamento, fila de duas horas, segurança e evidências/limitações dos testes.
Não alterar estoque, vínculos, cofre, banco de dados ou serviços externos sem autorização específica. Testes de descarga/cadastro não são testes rápidos seguros.
Preservar alterações existentes. Não excluir builds, caches ou dados para liberar RAM. Não publicar no GitHub nem substituir o EXE operacional sem pedido.
Consultar a política em `C:/Users/lugan/OneDrive/Documentos/Sidera Code/AGENTS.md`. Reservar conversa e pasta para este projeto; se a tarefa estiver associada a outro projeto, sinalizar e usar sempre a raiz explícita. Não mover conversas/pastas automaticamente.
