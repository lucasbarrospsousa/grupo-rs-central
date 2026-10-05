# Grupo RS Central — operação web

## Ambiente e responsabilidade pelos dados

O site usa o PostgreSQL do projeto Supabase existente, schema privado `central_homologacao`. A origem foi o backup de 24/09/2026, reconciliado com nova cópia consistente do desktop às 11:47 (Fortaleza): um aparelho atualizado e uma movimentação incorporada. O armazém foi conferido sem diferenças. Não há sincronização automática com o aplicativo desktop. Uma alteração feita no site não atualiza o banco do executável, e vice-versa.

O usuário autorizou testes de vinculação e troca somente na homologação. Os testes de escrita nas plataformas usam adaptadores simulados. SMS utiliza a ponte local autorizada em 24/09/2026. A versão 1.0 passa a ser o destino dos novos cadastros. O aplicativo desktop permanece preservado como consulta histórica; não continuar registrando nos dois sistemas. O nome interno do schema foi preservado para evitar uma migração desnecessária de credenciais e permissões. Não reexecutar importadores sobre o banco em operação.

## Hospedagem

- Site no ChatGPT: identidade persistida em `.openai/hosting.json`.
- API: função `central-api` no Supabase existente.
- SQL: papel `central_homologacao_web`, sem privilégios administrativos, com regras por filial.
- O site chama a API pelo servidor, usando segredo próprio de conexão. Senhas SQL e credenciais das plataformas não são enviadas ao navegador.
- A publicação conserva o acesso exclusivo do proprietário, conforme solicitado. O login da Central continua obrigatório.
- Nenhuma assinatura paga foi contratada por esta implementação. Limites e disponibilidade dos serviços são definidos pelos respectivos provedores.

## Funcionalidades

Estoque: pesquisa individual e por lista de séries, filtros, período, paginação, cadastro, edição, exclusão recuperável, CSV e PDF. Baixa: consulta por série, seleção e revalidação antes da alteração somente no SQL.

Vinculação: revisão explícita, operação remota registrada antes do envio, confirmação por leitura e atualização local somente depois de confirmação. Em timeout, usar Conferir sem reenviar; nunca repetir manualmente um pedido remoto incerto.

Cadastro em massa: TXT/CSV/TSV/XLSX, conferência de duplicados e conflitos, revisão e gravação transacional. XLSX aceita uma aba, até 2 MB compactados / 12 MB descompactados, 1.000 linhas e 30 colunas. Fórmulas e números que perderam precisão são rejeitados; séries devem ser texto ou ter formato numérico com os zeros iniciais.

Manutenção: atendimento e histórico versionados, filtro, PDF e troca local. Na troca, a reposição disponível passa a Instalada uma vez, com identificação da visita; o cadastro do aparelho de chegada e o vínculo remoto não são alterados automaticamente.

Rastreamento: consulta local, confirmação remota por série, histórico até sete dias, mapa de ruas, detalhes da posição, trajetória, reprodução e KML/PDF. O traçado separa intervalos acima de dez minutos; não é reconstrução comprovada das ruas percorridas. Mapa utiliza tiles OpenStreetMap sob demanda, com atribuição visível; não faz cache offline ou download em massa.

Armazém: cadastro, seleção, envio por destino, auditoria e consulta de chips. Configurações: acompanhamento da sincronização e verificações adicionais sob demanda. As falhas de consulta não são tratadas como estoque vazio.

## Validação e comandos

Em `web`, `node --test tests/*.test.mjs` executa os testes locais. `node tools/test-sql.mjs` e `node tools/test-integration-sql.mjs` usam identidades e registros descartáveis no schema de homologação. O segundo simula os serviços externos. `node tools/test-edge.mjs` testa login, isolamento, CRUD descartável e logout pela API publicada. Os scripts removem somente os registros pertencentes às identidades criadas por eles.

`node tools/migrate.mjs` aplica migrações versionadas faltantes. Não rodar importadores de backup sobre uma operação em uso sem reconciliação.

`node tools/build-hosting.mjs` prepara o checkout sanitizado em `.sites-runtime/central` e o pacote da API em `.sites-runtime/edge`. `node tools/deploy-edge.mjs` publica a API usando o token administrativo local; nunca publica o token nem a senha SQL administrativa. O token de publicação pode ser revogado após a entrega.

A publicação do Site usa o workflow do plugin Sites no checkout sanitizado. No Windows, o empacotador requer Git Bash no PATH e `TAR_OPTIONS=--force-local`. O fonte da Central permanece no repositório GitHub original; a hospedagem recebe apenas a seleção sanitizada.

## Recuperação

As exclusões do estoque são lógicas (`deleted_at`) e auditadas. Não remover fisicamente cadastros operacionais para corrigir a tela. Operações remotas pendentes devem ser reconciliadas por leitura antes de qualquer nova tentativa. Backup de código não substitui backup do SQL. As cópias não sensíveis em Downloads não contêm banco, credenciais ou dados de clientes; a atualização local dessas cópias não comprova sincronização com OneDrive.

## Entrega 1.0

URL: https://grupo-rs-central.lucasbarrosp.chatgpt.site

O painel inicial lê os totais confirmados pela sincronização do servidor e exibe falhas como pendências. Atualizar plataformas relê o resultado salvo; a coleta não depende da abertura da tela. Os gráficos da filial usam os cadastros SQL e agrupam variações do nome da operadora. Cards, barras e janelas respeitam movimento reduzido.

`node tools/backup-sql.mjs` salva uma cópia privada de todas as tabelas da Central, com migrações e SHA-256. Restaura os dados em tabelas temporárias com a estrutura e restrições atuais, compara os conteúdos e desfaz a transação. Não restaura sobre produção. Credenciais, hashes de login e dados privados nesse pacote impedem sua inclusão no Git ou backup público de código. Para recuperação após desastre, aplicar as migrações num banco isolado, importar na ordem das dependências e conferir antes de qualquer troca de destino; a verificação temporária não simula indisponibilidade total do provedor.

`tools/reconcile-snapshot.mjs` é ferramenta de virada, não sincronização. Exige backup SQL recente verificado, snapshot local e baseline privados; bloqueia conflitos com edições web, remoções e operações remotas pendentes. Não executar após começar a registrar operações no site. O relatório privado registra hash e diferenças aplicadas.

SMS continua pausado. Os testes de escrita nas plataformas reais continuam não autorizados; a integração implementada exige confirmação explícita do usuário na tela, preserva pedidos incertos e oferece reconciliação por leitura. Não foi feita vinculação real de teste nesta entrega.

## Atualização automática — 24/09/2026

O Supabase executa a coleta sem navegador, sessão pessoal ou computador ligado. O ciclo cobre todos os aparelhos ativos no SQL das quatro bases, com lotes de até 50 e três consultas concorrentes. Cada execução trabalha por até 45 segundos antes de deixar o restante para a próxima chamada. O agendador acorda a cada minuto para continuar a fila. Após finalizar a fila completa, aguarda cinco minutos para iniciar outro ciclo. **Cinco minutos não é garantia de que cada aparelho será atualizado nesse prazo**: a duração da varredura depende da quantidade, latência e limites das plataformas. O aviso no site mostra o progresso real.

A coleta consulta cadastro/ICCID, localização/comunicação e operadoras Arya e Link. Confere série e ICCID exatos; não inventa online quando só existe situação cadastral. Persiste observações separadas do estoque, preserva a última resposta confirmada e registra falhas. Não dá baixa, vincula, exclui ou envia SMS automaticamente. Histórico e trajetos continuam sob demanda para o período solicitado.

Tokens expirados recebem uma renovação e uma repetição de leitura. Credencial rejeitada interrompe as tentativas dessa integração e gera aviso persistente no site. A mudança do segredo no servidor libera nova validação. Recusa de acesso após renovar a sessão também pausa a integração, com motivo diferente; falha de rede não é senha inválida. Os demais provedores continuam funcionando.

Migrações 006 e 007 adicionam fila, bloqueio de execução simultânea, observações, alertas e panorama. As funções SQL são restritas ao servidor. O endpoint interno exige segredo próprio, mantido no Vault e no ambiente da função; não aceita o login do navegador como autorização. `node tools/schedule-sync.mjs` instala/atualiza o job idempotente `central-background-sync` e habilita o intervalo de cinco minutos. Não expõe o segredo nos logs.

O PHP das plataformas diferencia `Authorization` de `authorization`. Na hospedagem, o transporte TLS usa HTTP/1 e preserva essa grafia, com validação TLS padrão, limite de resposta e timeout. As quatro APIs e os quatro portais foram conferidos na hospedagem após a correção. Referência do agendamento: https://supabase.com/docs/guides/functions/schedule-functions.

O menu lateral agora é compartilhado em todas as páginas, incluindo ícones, largura, grupos recolhíveis, seleção e rodapé. Estoque relê as observações SQL a cada minuto enquanto estiver aberto; a coleta externa continua independente.

## Estoque: consulta da página e localização — 24/09/2026
A página consulta automaticamente até 10 séries visíveis, com duas consultas simultâneas, incluindo plataforma e chip. Ao mudar página/filtro, descarta a fila anterior; requisições já iniciadas podem terminar, sem redesenhar outra página. Atualiza novamente a cada minuto enquanto visível e oferece atualização manual. O ciclo geral do servidor continua independente, em cinco minutos entre ciclos. Credenciais recusadas respeitam a pausa persistida do sincronizador.
O botão de localização abre mapa OpenStreetMap com marcador, dados da última posição, zoom, centralização, cópia das coordenadas e link Maps. Ausência de posição confirmada é explicitada. Nenhuma consulta altera cadastro ou envia comandos.
Validação: 62 testes automatizados; navegador isolado em 1917×991 com dados sintéticos, consulta dos 10 itens, próxima página, mapa, atualização e reabertura sem erros JavaScript.
Consulta real somente leitura também confirmou equipamento, localização com coordenadas válidas e chip, sem pendências, em uma série de Imperatriz. Publicação privada confirmada: d7956a60892ee3fad4b2b03d55e2195ef2eed356 (fonte Sites).

### Baixa individual do estoque — regra do executável

O campo Veículo aceita a placa na própria linha. Dar baixa pede confirmação e registra a instalação no SQL da Central, preservando identificação, gravando placa em maiúsculas, situação Instalado e data. Não modifica a plataforma externa. A rota POST /api/install exige sessão, filial autorizada, CSRF, confirmação, versão atual e chave de idempotência; a transação registra auditoria. Analisar baixa continua sendo o fluxo independente de conferência de vínculos remotos.

Tipo segue src/tracker_versions.gd: GRS → V7.3.2; AAA → V7.2.2/7.1.6; XRS → V7.3.5, com normalização dos nomes antigos. Essa classificação não representa leitura de firmware.

Validação: 65 testes automatizados, fluxo sintético no navegador e cadastro temporário no SQL de homologação (gravação, releitura, repetição idempotente e rejeição de versão antiga). Nenhum aparelho operacional foi baixado nos testes.

## Ponte SMS do computador

`node web/tools/sms-bridge.mjs` mantém uma conexão de saída com o SQL e consulta o Galaxy com o certificado e o token já pareados no desktop, sem escrever na fila SQLite. A configuração privada fica em `.secrets/homologacao/sms-bridge.json`. O computador precisa permanecer ligado, com a sessão Windows iniciada, e o Gateway ativo na mesma rede. A inicialização automática usa um atalho na pasta Inicializar do usuário, executando `web/tools/run-sms-bridge.ps1` oculto. Não abre portas de entrada. Se o endereço do Galaxy mudar, atualizar a configuração privada após conferir o celular; nunca desativar a validação do certificado.

A API aceita comandos revisados somente para séries 024 de Imperatriz, conferindo o telefone novamente na plataforma. Registra a fila antes do envio. A ponte grava a tentativa antes do PUT; reinícios, timeouts e retornos ausentes geram apenas consultas ao mesmo pedido. Pedidos antigos sem marca da ponte não são enviados. Há trava de instância e índice de exclusividade por aparelho. Retornos de entrega são acompanhados por até 24 horas após a criação. A indisponibilidade não é confirmação de falha.

O painel lê o banco a cada 15 segundos; heartbeat com mais de 90 segundos é desconectado. Novos envios exigem ponte recente. Pendências incertas bloqueiam outro envio para a mesma série e exigem conferência; não há reenvio automático nem disparo em massa. Os testes de fila SQL usam uma trava que impede execução junto da ponte real. Validação realizada com gateway health real e fila/transporte sintéticos, sem disparar SMS real.

Recuperação da ponte: o inicializador resolve o Node pelo caminho instalado, sem depender do PATH do Codex. Um mutex evita supervisores duplicados. Quedas reiniciam o processo após 30 segundos; três falhas seguidas de conexão ou um ciclo travado por 180 segundos provocam reinicialização. O Galaxy indisponível é consultado novamente a cada ciclo. Credencial SQL inválida interrompe o reinício e exige correção. O estado local, sem credenciais nem mensagens, fica em `.secrets/homologacao/sms-bridge-health.json`. A janela de SMS acompanha a reconexão por até um minuto, apenas consultando saúde; não cria nem reenvia pedidos. Computador desligado, Gateway parado e credencial alterada exigem intervenção.

## Assinatura SideraCode
Faixa fixa compartilhada por todas as abas e login, com logo oficial transparente para fundo escuro e texto Desenvolvido por. Espaço reservado abaixo da página e da barra lateral, movimento reduzido respeitado, oculta na impressão.

## Logs do sistema — 27/09/2026

Acesse **Logs do sistema** no menu lateral, usando lucasabm. A aba reúne todas as filiais, permite pesquisar usuário/registro/ação e filtrar módulo, resultado e período. Os cards refletem o filtro; Detalhes apresenta antes/depois nos campos que foram auditados. Horários são exibidos em Fortaleza.

O novo histórico conserva até 10.000 registros ou 8 MiB de conteúdo, descartando os mais antigos apenas dessa tabela. A auditoria original continua preservada. Senhas e credenciais não são guardadas; ações de interface ficam separadas das gravações transacionais. O quadro de armazenamento informa consumo real, sem inventar espaço livre do plano. Atualizar/Pesquisar relê o histórico. Veja [relatório técnico](../Relatorios/LOGS_DO_SISTEMA_2026-09-27.md).


## Controle de consultas automáticas — 28/09/2026

Em Configurações, a administração encontra “Consultas automáticas e consumo”. Permite ligar/desligar o sincronizador das quatro bases e selecionar 5, 10, 30 minutos ou 1 dia. A alteração persiste no servidor, com sessão, permissão de proprietário e CSRF. Consultas das páginas, botões e testes manuais não dependem desse interruptor. Um lote já iniciado pode terminar.

O intervalo passa a valer entre lotes de até 50 aparelhos, além da espera ao terminar a fila. Portanto 1 dia não significa renovar todo o estoque diariamente. O agendador SQL verifica estado, intervalo, próxima execução e trava antes de enviar HTTP à função. O sync_claim também aplica o intervalo, protegendo chamadas diretas. O controle do Portal pode espaçar o cron ainda mais, mas não pode encurtar o mínimo salvo aqui nem reativar a coleta. Reinstalar tools/schedule-sync.mjs preserva preferências.

O gráfico soma requisições HTTP efetivamente tentadas pelas integrações Grupo RS API, portais, Arya/Innova e Link Solutions. Inclui login e repetição; falhas contam separadamente. “Páginas e botões” inclui as consultas disparadas pelas páginas abertas. Não mede GB de logs, banco, Drive, SMS da ponte local ou cobrança Supabase. Sem retroatividade. Guarda apenas agregados diários por origem e integração por 30 dias UTC, sem credenciais, URLs de consulta ou dados de clientes; grava uma vez por atendimento/lote. Falha de telemetria não bloqueia a operação e produz aviso técnico, portanto os totais não equivalem a auditoria financeira garantida.

Migração 019 e ferramenta tools/migrate-automation.mjs validam pausa, intervalos e contadores com rollback dos dados de teste. Não ativar/desativar a operação apenas para testes. Implantação da API via build-hosting/deploy-edge; frontend pelo fluxo Sites. Validação desta entrega: 129 testes Node, testes SQL transacionais e interface sintética em 1440×900 e 390×844, incluindo salvar, desligar, filtro e ausência de erros/overflow. Não houve baixa ou escrita nas plataformas externas.


## Integração exclusiva API v2 — 30/09/2026

Esta seção substitui as descrições anteriores de consultas ao portal. Todas as leituras Grupo RS usam `/api_rest_app/api/v1`, JWT e as rotas do Manual API IMP v2. Foram removidos login web, leitura de HTML, get_data e get_eventos. Equipamentos, veículos, associados, comunicação e posições usam a API. As APIs Arya/Link permanecem. Nenhuma credencial foi trocada nesta migração.

A API observada não fornece o titular na listagem de veículos. Sem titular confirmado, vínculo fica para conferência e não habilita baixa automática. Vinculação remota ficou indisponível: o fluxo anterior criava e associava por uma rota legada, e seu contrato não pode ser presumido na v2. A lista remota de veículos em manutenção não é documentada: retorna indisponibilidade explícita, sem usar o panorama antigo. Atendimentos e estoque registrados na Central permanecem.

Clientes exigem pelo menos três caracteres; veículos de atendimento são reconsultados e confirmados pelo identificador e nome do associado. Histórico aceita até sete dias, pagina por cursor e marca parcial após vinte páginas; distância fica não informada quando não retornada. Resultados ausentes ou fora do escopo não comprovam inexistência na plataforma.

Migração 020 aplica controle compartilhado entre instâncias: mínimo de 1,1 segundo entre chamadas por base (incluindo login), no máximo duas chamadas simultâneas, leases de 25 segundos para transporte limitado a 18 segundos. Espera local limitada a 12 segundos; excesso informa aguardar. Isso limita as chamadas desta Central, não controla outros consumidores da mesma conta/IP. O ciclo agora processa até dois aparelhos em paralelo. Operadoras têm seu controle independente.

Validação: `node --test web/tests/*.test.mjs`; `node web/tools/migrate-api-v2.mjs` testa migração/intervalo/leases/permissões com rollback; `--apply` aplica após testes e reverte apenas os dados sintéticos. Leituras reais em Imperatriz; permissões das outras três bases permanecem pendentes no fornecedor. Nenhuma escrita foi testada nas plataformas.


## Consistência AJAX de chips e Armazém — 30/09/2026

Ao entrar em Estoque ou Armazém, a Central relê o grupo necessário no SQL; redesenhos da mesma tela reutilizam os dados. Armazém atualiza tabela e contadores sem reconstruir a página, preservando busca/destino e removendo da seleção itens indisponíveis. A releitura automática usa intervalo-base de 60 segundos, ampliado pelo controle de economia, somente com a aba visível e sem modal aberto. Não consulta APIs externas. O botão de Estoque agora também relê os cadastros SQL.

Consultas de contatos invalidam o cache do Armazém, e o dado de ICCID/telefone salvo tem prioridade na apresentação sobre amostras antigas. A migração 021 preserva futuras edições explícitas de contatos enquanto a plataforma ainda informa valores diferentes; não grava nem altera o chip no fornecedor. Quando a API confirma os mesmos contatos, a sincronização normal volta a acompanhá-los. A guarda é criada somente pelo servidor; não é um campo editável do navegador. Edições anteriores não são reconstruídas automaticamente.

Testes: suíte local, `node web/tools/migrate-manual-contacts.mjs` (rollback), `node web/tools/test-chip-usage-sql.mjs` (rollback). A flag `--apply` do primeiro aplica a migração após validar e reverter fixtures. Cobertura de baixa do chip cadastrado, troca, telefone, repetição, API divergente e confirmação posterior. O chip desvinculado não retorna automaticamente à disponibilidade; essa regra operacional foi mantida.

## Ajuste final de titulares e acesso API — 30/09/2026

Esta seção atualiza as limitações registradas na primeira migração v2. As quatro bases agora usam credenciais próprias de API, armazenadas somente no cofre/segredo do servidor. Os hosts são imp, arg, acl e mab em ogrupors.com.br; o servidor indicado incorretamente no Swagger de outra base não é utilizado.

A API passou a fornecer `titular.codCliente`, `titular.nomeCliente` e `qtdClientesVinculadosAtivos` nos veículos. A análise de baixa lê esse titular e mantém conferência quando ausente ou com múltiplos vínculos. Nos atendimentos, pesquise por placa, série ou identificação (mínimo três caracteres), selecione o titular e depois o veículo. A busca usa `/veiculos?q=...`; a confirmação usa `/clientes/{codCliente}/veiculos`, com paginação limitada e falha explícita para lista incompleta. Não há consulta a `/associados` nem busca de cliente por nome nesse fluxo. O servidor reconfirma titular, veículo, placa e série ao salvar. O histórico reconhece o campo `data` das posições.

Permanecem indisponíveis a lista remota de manutenção (sem rota documentada) e a criação/associação remota de veículos (escrita ainda não homologada). Não há fallback web. Registros de atendimento e baixas locais continuam separados de alterações na plataforma externa. Mantidos limite compartilhado de chamadas, idempotência, permissões e configurações de automação.

Validação: 138 testes locais; oito verificações SQL transacionais com rollback; consultas reais de veículos/titulares nas quatro bases e confirmação de veículos do cliente em Imperatriz. Nenhum cadastro externo alterado. Credenciais não pertencem ao código, GitHub ou backup público.

## Vinculação e revisão dos acessos — 30/09/2026

A confirmação de vínculo voltou a funcionar exclusivamente pela API para aparelhos e identificações existentes. A prévia confere série exata, identificação AAA/GRS/XRS, titular RS300, ausência de outro aparelho e ausência de vínculo do aparelho com outro veículo. O envio usa POST `/veiculos/{id}/equipamento` com `mover:false`, após nova conferência. A operação durável continua impedindo reenvio automático; leitura posterior confirma a associação antes de atualizar Estoque. Não cria veículo, cliente ou equipamento e não transfere aparelhos entre veículos. Ausência na resposta é apresentada como cadastro/escopo não confirmado, sem afirmar inexistência no fornecedor.

As consultas de páginas agora compartilham a proteção de credenciais do sincronizador. HTTP 403 de uma rota Grupo RS não pausa todas as rotas da filial; login recusado e HTTP 401 persistente continuam protegidos. As quatro bases usam a conta específica de API já atualizada no cofre; veículos e equipamentos foram conferidos em cada base. Não foram modificados usuários ou permissões externas. O acesso à prévia e às operações de vínculo respeita o módulo Vinculação.

Cadastro em massa passou a pedir placa, série ou identificação na busca de titular. A confirmação de vínculo normaliza a identificação e mostra o resultado da prévia antes de permitir escrita; uma prévia que falhou não habilita o botão.

Validação: 147 testes Node, interface sintética no Chrome sem erros, oito consultas de conexão bem-sucedidas (veículos e equipamentos em quatro bases). Escritas externas testadas somente com respostas simuladas. Permanecem pendentes a criação remota com escolha documentada de titular e a classificação de manutenção remota, cuja regra não é fornecida na documentação atual.

## Correção das permissões de backup — 30/09/2026

A migração 022 restabelece leitura de todas as tabelas/sequências privadas para central_backup e políticas SELECT nas tabelas com RLS. query_usage, api_v2_budget e api_v2_leases haviam sido criadas após a configuração inicial, causando SQLSTATE 42501 antes do envio ao Drive. Não concede escrita operacional. Privilégios padrão do proprietário que executa as migrações concedem SELECT às próximas tabelas/sequências; futuras tabelas com RLS ainda devem incluir central_backup_read. Execute a ferramenta de conferência após migrações para verificar os acessos.

`node web/tools/migrate-backup-permissions.mjs` aplica a migração idempotente, verifica leitura e testa privilégios padrão com tabela sintética revertida. O worker é reconstruído com as migrações atualizadas e publicado por deploy-backup-worker.mjs, sem alterar a conta Google, a chave, a pasta, a retenção ou o agendamento. A recuperação executa o worker real, que envia a cópia criptografada ao Drive, baixa e verifica hash e restauração em tabelas temporárias antes de marcar sucesso.

## Consulta de localização com resumo de veículos — 30/09/2026

Quando a pesquisa por série não retorna o veículo, a localização usa a placa salva no cadastro da Central como pista de pesquisa. Exige resultado único e completo por placa e confirma veículo e série exata na resposta de `/veiculos/{id}/comunicacao`. Placa antiga, série ausente ou divergente bloqueiam o resultado. Não usa a rota de detalhe que está retornando lista genérica, nem varre a frota. O comportamento se aplica às consultas de página e à sincronização automática; não altera regras de vinculação.

A migração 023 acrescenta a placa aos lotes de sync_claim preservando a definição existente, permissões e agendamentos. `node tools/migrate-location-hint.mjs` verifica em transação revertida; `--apply` aplica. Validação: 151 testes Node aprovados, migração idempotente e consulta real de aparelho operante em Imperatriz com série confirmada e coordenadas retornadas.

## Compatibilidade com o resumo de veículos da API — 30/09/2026

A busca por série agora aceita o resumo de veículo sem campo de série somente após conferir o equipamento exato, seu código de veículo e a placa vinculada. Isso permite localização, posições e o trajeto construído pela interface nas quatro bases sem depender da placa local. Divergências, múltiplos candidatos e respostas parciais bloqueiam a confirmação. A ausência de titular continua exigindo conferência antes de baixas; o sistema não inventa cliente a partir do resumo.

Buscas por placa preservam espaços e hífen, inclusive no recurso de consulta por placa salva e na prévia de vinculação. Validação local: 154 testes aprovados, incluindo consultas nas quatro bases com respostas simuladas e recusas por divergência de vínculo. As verificações reais são somente de leitura; não criam nem movimentam equipamentos.

## Lotes da página de estoque e cadastro independente — 30/09/2026

A lista solicita um lote de até dez IDs locais por página. A localização renova a cada 60 segundos com a aba visível e conexão disponível; não sobrepõe o mesmo lote, descarta respostas obsoletas e substitui a leitura anterior por estado de consulta. A API externa continua limitada a duas chamadas simultâneas e ao orçamento compartilhado: take=50 é paginação, não entrada de cinquenta séries. A localização faz equipamentos por série e comunicação com conferência de série/código de veículo; não consulta operadora.

Chips têm lote separado, ao abrir a página e a cada três minutos, usando exclusivamente o ICCID salvo. O botão Atualizar aparelhos consulta os até dez registros visíveis e grava ICCID, telefone, operadora e APN confirmados, com permissão de escrita em Estoque, versão otimista, auditoria e acionamento dos controles de armazém existentes. Dados incompletos/conflitantes preservam o cadastro e geram pendência individual. A atualização invalida a leitura do chip e consulta novamente o ICCID salvo. Não altera a configuração da sincronização geral na nuvem nem apaga históricos/auditoria.

Validação: 159 testes automatizados; gravação SQL sintética revertida (quatro campos e repetição sem nova versão); interface sintética com dez sucessos, paginação e sem erros de console. Nenhuma API aceita um array de séries no contrato atual; o servidor distribui o lote com concorrência controlada.

## Busca de titular por nome — 01/10/2026
Novo atendimento oferece Nome do titular (padrão) via /associados?q=...&take=20 e Placa, série ou identificação via /veiculos. A documentação confirma codAssociado = codCliente. IDs divergentes, resposta incompleta e limite de resultados exigem refinar a busca. A seleção continua consultando /clientes/{codCliente}/veiculos e o servidor reconfirma a identidade ao salvar. Mensagens de consulta ficam junto da busca. Substitui a restrição anterior de busca somente por veículo.
Quando a rota de veículos por cliente retorna veículos sem titular, o fluxo confirma novamente o associado pelo ID e nome exatos e usa exclusivamente os veículos aninhados nesse associado. Não atribui a lista genérica ao cliente. Duplicidades e conflitos bloqueiam a confirmação. Teste de leitura real em 01/10 confirmou um titular, um veículo e a série, sem salvar atendimento.


## Correção dos PDFs — 01/10/2026

O gerador compartilhado incorpora a fonte Noto Sans completa. A redução por subconjunto causava desaparecimento visual de letras e números, apesar de o texto extraído estar correto. Estoque, manutenções e histórico de posições usam a mesma correção em todas as bases. Validação: reprodução antes/depois com PDFium, 90 linhas em cinco páginas, acentos, placas e zeros iniciais; três testes de completion aprovados. Conferir sempre a renderização, pois extrair texto ou reabrir o PDF não detectava este defeito.

## Cadastros nas quatro filiais — 03/10/2026

- Estoque oferece Novo equipamento em Imperatriz, Araguaína, Açailândia e Marabá, respeitando as permissões existentes. O formulário não oferece uma instalação nova pelo CRUD: usar Dar baixa ou Analisar baixa.
- Cadastro em massa confere as séries da filial antes da confirmação e identifica as já cadastradas. Retirar séries já cadastradas é uma ação explícita, com possibilidade de desfazer; erros de leitura continuam bloqueando a lista. O limite de envio é 500 equipamentos por lote.
- A filial revisada e a chave da operação são preservadas durante o envio e a repetição da mesma confirmação. Se a gravação concluir e a atualização da lista falhar, a tela informa cadastro salvo e pede atualização, sem repetir a gravação.
- O servidor e as restrições transacionais/uniqueness por filial permanecem os mesmos. Nenhuma integração externa é utilizada para criar equipamentos de teste.
- Evidência da investigação: duas recusas POST /bulk de Araguaína em 02/10, HTTP 409, compatíveis com série já cadastrada (a rota não possuía outra regra de conflito aplicável ao formulário). Não houve gravação de teste em produção.
- Validação: testes locais de cadastro, lote, cache, estoque, permissões e servidor; formulários e detecção/retirada de duplicados conferidos no navegador nas quatro bases, em demonstração isolada.
- Prévia local: servidor também serve módulos .mjs, exigidos pela interface atual.

## Comunicação da página e titular sob demanda — 03/10/2026

- Nos modos API e Ambos, o lote de até dez aparelhos usa exclusivamente a API para comunicação (série/vínculo, ignição, datas do servidor/GPS, coordenadas e demais campos retornados). A falta de titular não aciona mais a web para cada linha. Somente web continua respeitando a configuração explícita da filial.
- Abrir Localização reaproveita a comunicação já carregada e mostra o mapa imediatamente. Em paralelo, consulta apenas o vínculo/titular na web, para um aparelho. Série, código do veículo e placa devem coincidir antes de mostrar o nome. Esse complemento não substitui coordenadas, datas ou ignição. Somente API não consulta o titular na web.
- Fechar a janela cancela as solicitações do modal e descarta respostas tardias. Centralizar permanece disponível enquanto o complemento é consultado. Atualizar consulta comunicação e titular independentemente. A renovação da lista preserva a amostra anterior durante a espera, indicando consulta em andamento.
- Testes focados: 32 aprovados, incluindo quatro bases, separação das fontes, falhas da API, divergências de titular/vínculo, paginação, cancelamento e dados de GPS. Consultas reais somente de leitura: 10/10 comunicações em cada base, zero chamadas web nos lotes; Imperatriz 28,31 s, Araguaína 27,15 s, Açailândia 27,24 s e Marabá 26,77 s. Um titular por base confirmado separadamente em 3,69 / 3,24 / 2,94 / 3,07 s. Tempos de uma amostra real, não garantia de latência.
- Backend central-api e frontend Sites versão 59 publicados. Nenhum cadastro operacional foi criado ou alterado pelos testes.
- Conferência posterior no navegador publicado: páginas de dez, mapa e titular separado nas quatro filiais; mapa continuou disponível durante o complemento e Centralizar funcionou. Em outra amostra de Araguaína, 9/10 retornaram e um aparelho ficou pendente pelo orçamento compartilhado de consultas da API (havia outras consultas/abas ativas); não foi mascarado como ausência de aparelho nem acionou web para comunicação. Lotes observados na tela levaram aproximadamente 27–35 segundos, sujeitos à concorrência. Comunicação antiga de aparelhos em estoque permanece sinalizada como desatualizada.

## Manutenções e ignição — 05/10/2026
O bloco de manutenções carrega e atualiza independentemente dos demais dados. Ignição pode ser filtrada no gráfico e na tabela (Todas, Ligada, Desligada, Não informada). O percentual usa os veículos do filtro divididos pela frota ativa total da base. A ignição representa a última comunicação, não presença online; consultas ausentes/falhas não significam desligado. Enquanto houver desconhecidos, os filtros Ligada/Desligada são identificados como parciais.
Migração 027: cache privado das listas e ignições, sem permissões anônimas. Coleta independente pelo endpoint interno autenticado /internal/maintenance, até oito veículos por execução e dois em paralelo, distribuídos entre bases. Cron central-maintenance-ignition verifica a fila a cada minuto, sem invocar a API quando não há trabalho. Listas atualizadas por base a cada hora; botão Atualizar manutenções força apenas a lista. Ignições confirmadas reutilizadas por 24h, invalidadas imediatamente quando a placa ou a comunicação da lista muda. Falhas aguardam uma hora antes da nova tentativa; lista remota com erro aguarda 15min e mantém os dados anteriores. Resultado só entra após conferir série e placa. Os limites e bloqueios de credencial das integrações continuam aplicados. Sem escrita nos veículos, SMS, chip ou histórico.
A tela relê apenas dados salvos a cada minuto enquanto visível. A coleta continua com navegador fechado; depende do Supabase e das plataformas. Primeira coleta é gradual, não instantânea. tools/configure-maintenance-monitor.mjs --pause pausa preservando resultados; --enable ativa depois da migração e da API correspondente publicada.
Validação: 17 testes focados (ignição, percentuais, origem e identidade); tools/test-maintenance-monitor-sql.mjs verifica cache, invalidação, lease e privilégios numa transação sempre revertida. UI demonstrativa em 1917x909, combinando ignição/APN e mantendo estoque pendente para comprovar independência. Consulta real das quatro bases e amostra de ignição por base confirmadas; não equivalem a conferir toda a frota.

## Estoque, alertas e atendimento manual — 05/10/2026

- A busca do estoque, situação, período, ordenação e página são preservados por usuário e filial no navegador. Limpar busca continua disponível. A navegação não mantém consultas de comunicação da página anterior em execução.
- O botão **Alertas de estoque** permite limites por filial para estoque da base, aparelhos disponíveis do armazém e chips disponíveis do armazém. Limite vazio desativa aquele tipo; zero alerta quando esgotado. Preferências locais por usuário/navegador; não são configurações globais do servidor.
- Alertas consultam somente totais SQL, a cada dois minutos enquanto a sessão e a plataforma estão abertas. Falhas não viram zero. Um aviso persistente na tela identifica filial, tipo, quantidade e limite; a mesma contagem não é repetida durante a sessão de monitoramento. Notificação no computador é opcional, depende da permissão do navegador e abre/foca a página correspondente. Não há push com navegador fechado; suspensão do navegador pode atrasar o aviso.
- Novo equipamento: **Buscar dados preenchidos** consulta série, ICCID, identificação ou telefone, priorizando o cadastro da filial e enriquecendo por fontes autorizadas. Origem indisponível mantém os dados locais com aviso. Prefixos XRS/GRS/AAA preenchem a versão conforme a regra existente; não medem firmware. Conferir e Salvar é necessário.
- Novo cadastro já existente atualiza a mesma série, sem duplicá-la, preservando situação e campos vazios já cadastrados. Série e chip apontando para aparelhos diferentes bloqueiam a gravação para não substituir identidades ou transferir chips silenciosamente. Edição preserva versão e operações são idempotentes.
- Manutenção permite identificação manual (cliente, placa/identificação e série) em todas as bases, sem consulta API/web, marcada no histórico. Consulta assistida tenta completar série ausente pelo cadastro do equipamento. Troca mantém a validação transacional de disponibilidade e versão da reposição; nenhuma vinculação remota é criada.
- Validação: testes locais de regras e integrações simuladas; `node tools/test-inventory-workflows.mjs` usa registros SQL descartáveis com limpeza, testes de atualização/idempotência/permissão/conflito de chip e manutenção manual. Consultas externas simuladas nesse script; duas consultas reais somente de leitura (identificação e ICCID) foram conferidas separadamente. UI validada em 1917 × 909 com dados demonstrativos.

## Localização por código salvo — 05/10/2026

A agulha do estoque abre comunicação e mapa sem buscar/enriquecer titular. Mostra placa, série, coordenadas, ignição, bateria (valor bruto, sem presumir unidade), horário GPS e horário do servidor. Horários sem fuso da plataforma são interpretados como UTC-3; atualização manual é AJAX e preserva os demais módulos.

Em Imperatriz, `location_device_codes` lê apenas códigos válidos de cadastros ativos cuja série ainda coincide, nos estados confirmado ou divergência de placa. A consulta usa `/veiculos/{codVeiculo}/comunicacao` diretamente e exige veículo, série e equipamento correspondentes antes de expor a posição. Divergência bloqueia a localização e orienta Atualizar aparelhos. Sem código salvo, resolve o equipamento por série antes da comunicação, sem consultar titular. A preferência somente web das bases continua respeitada; os demais fluxos cadastrais não foram alterados.

Migração: `node web/tools/migrate-location-codes.mjs` (versões 30/31). Testes offline: `node --test web/tests/cached-location.test.mjs web/tests/communication-flow.test.mjs web/tests/background-sync.test.mjs web/tests/read-sources.test.mjs web/tests/stock-batch.test.mjs`. Interface sintética: `web/tools/test-cached-location-ui.mjs`, com Playwright indicado em `PLAYWRIGHT_MODULE`; valida atualização sem consulta de titular e layout 1917×913. Não dispara consultas operacionais.

## APN coletada pela sonda e consulta direta do chip — 05/10/2026

A sonda de códigos de Imperatriz captura APN e ICCID na mesma resposta de equipamento. A migração 32 guarda a evidência em `device_codes` e preenche/atualiza `devices.data.apn` somente quando o ICCID retornado coincide com o atual cadastro; não troca chip, placa ou titular. APN ausente não apaga um valor salvo. Enriquecimento exclusivo de APN não dispara movimentações de armazém.

Cadastros antigos sem APN e sem coleta anterior entram nos lotes de dez, priorizando estoque e respeitando intervalo, pausa, limite compartilhado e retentativas existentes. Uma resposta sem APN é registrada como consultada para evitar repetição infinita. Divergência de ICCID exige Atualizar aparelhos/conferência. O monitor informa a quantidade com APN salva e mantém a carga pendente enquanto faltam coletas iniciais.

Na página de estoque e no monitor do servidor, o ICCID e a APN vêm do banco: `hinova.br` → Arya/Hinova; `linksolutions.br` → Link. São aceitos também os rótulos exatos `hinova` e `linksolutions`, ignorando maiúsculas e espaços externos. Não se infere operadora por substring nem se tenta outra operadora em falha. APN ausente/desconhecida fica pendente sem chamada externa. A resposta deve confirmar o mesmo ICCID. Alteração de APN invalida o prazo do chip no próximo ciclo do monitor.

Validação SQL com rollback: `node web/tools/migrate-probe-apn.mjs`. Para aplicar, acrescentar `--apply` (schema 31/32). Testes: `node --test web/tests/chip-status.test.mjs web/tests/code-scan.test.mjs web/tests/stock-batch.test.mjs web/tests/stock-monitor.test.mjs web/tests/cached-location.test.mjs web/tests/background-sync.test.mjs`. A sonda permanece restrita a Imperatriz; as demais bases usam a APN já cadastrada ou Atualizar aparelhos.

## Reaproveitamento da análise de baixa — 05/10/2026

A janela Analisar baixa guarda resultados válidos por até cinco minutos em memória da sessão. Ao reabrir, consulta apenas itens novos, alterados, vencidos ou com falha; chave inclui filial, id, série, versão, situação, placa e cliente locais. Respostas não substituem id/versão locais. O botão Analisar novamente invalida os resultados anteriores e força a leitura completa. Logout limpa o cache. Não há armazenamento persistente de clientes no navegador.

Aplicar baixa continua passando pela confirmação explícita e pela consulta fresca do vínculo no servidor; nenhuma resposta em cache autoriza a escrita. O cache do item é invalidado antes da tentativa de baixa. A primeira análise continua usando as fontes configuradas e consultando o titular necessário à classificação.

Testes: `node --test web/tests/discharge-cache.test.mjs web/tests/discharge-batches.test.mjs web/tests/manual-discharge.test.mjs`. `web/tools/test-discharge-cache-ui.mjs` valida abrir/reabrir, falhas, atualização forçada e confirmação com dados sintéticos; nenhuma baixa real é executada.

## Baixa por código de equipamento e titular web — 05/10/2026

Fluxo aprovado: código salvo → `GET /equipamentos/{codEquipamento}` → placa atual da resposta → busca dessa placa em `cadastro/veiculos_listar.php` na mesma base → titular. A API deve confirmar código, série e equipamento ativo; o portal deve retornar uma única placa exata com a mesma série e `codVeiculo`. Placa antiga e titular local não são usados como pistas. Ausência, duplicidade ou divergência não são elegibilidade automática.

`dischargeBinding` é exclusivo da análise/baixa e usa API+web explicitamente, independentemente da preferência geral das outras consultas. Sem código salvo, resolve o equipamento pela série uma vez; não varre a frota. `binding_device_code` lê somente cadastro ativo com a mesma série. O fluxo não altera vínculos nas plataformas. No POST de baixa, a mesma sequência é refeita e comparada com placa/cliente apresentados; versão e idempotência permanecem protegidos. As regras existentes de baixa manual explicitamente confirmada continuam aplicáveis.

A otimização de cinco minutos da reabertura permanece; Analisar novamente força o novo fluxo. Teste real somente leitura em Imperatriz confirmou série, placa atual e titular web, sem executar baixa. A sonda permanece pausada conforme ação do usuário.

Migração: `node web/tools/migrate-discharge-code.mjs` (schema 32/33). Testes: `node --test web/tests/discharge-code-flow.test.mjs web/tests/discharge-cache.test.mjs web/tests/discharge-batches.test.mjs web/tests/manual-discharge.test.mjs web/tests/read-sources.test.mjs web/tests/cached-location.test.mjs`.
